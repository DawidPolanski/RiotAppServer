require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const Bottleneck = require("bottleneck");
const NodeCache = require("node-cache");

const app = express();
const port = 3001;

app.use(cors());

const API_KEY = process.env.API_KEY;
const matchCache = new NodeCache({ stdTTL: 600 });
const summonerCache = new NodeCache({ stdTTL: 600 });
const leagueCache = new NodeCache({ stdTTL: 600 });

const limiter = new Bottleneck({
  minTime: 50,
  maxConcurrent: 1,
});

const platformRegions = {
  KR: { region: "asia.api.riotgames.com", url: "kr.api.riotgames.com" },
  EUW: { region: "europe.api.riotgames.com", url: "euw1.api.riotgames.com" },
  EUNE: { region: "europe.api.riotgames.com", url: "eun1.api.riotgames.com" },
  BR: { region: "americas.api.riotgames.com", url: "br1.api.riotgames.com" },
  JP: { region: "asia.api.riotgames.com", url: "jp1.api.riotgames.com" },
  LA1: { region: "americas.api.riotgames.com", url: "la1.api.riotgames.com" },
  LA2: { region: "americas.api.riotgames.com", url: "la2.api.riotgames.com" },
  OC: { region: "sea.api.riotgames.com", url: "oc1.api.riotgames.com" },
  NA: { region: "americas.api.riotgames.com", url: "na1.api.riotgames.com" },
  TR: { region: "europe.api.riotgames.com", url: "tr1.api.riotgames.com" },
  RU: { region: "europe.api.riotgames.com", url: "ru.api.riotgames.com" },
  PH: { region: "sea.api.riotgames.com", url: "ph2.api.riotgames.com" },
  SG: { region: "sea.api.riotgames.com", url: "sg2.api.riotgames.com" },
  TH: { region: "sea.api.riotgames.com", url: "th2.api.riotgames.com" },
  TW: { region: "asia.api.riotgames.com", url: "tw2.api.riotgames.com" },
  VN: { region: "sea.api.riotgames.com", url: "vn2.api.riotgames.com" },
};

let requestCount = 0;

function incrementRequestCount(url) {
  requestCount += 1;
  console.log(`Total API requests: ${requestCount}`);
  console.log(`Request URL: ${url}`);
}

function logRequestDetails(url) {
  console.log(`Making request to: ${url}`);
}

app.get(
  "/summonerAndMatchData/:summonerName/:summonerTagLine/:opponentName/:opponentTagLine",
  async (req, res) => {
    const { summonerName, summonerTagLine, opponentName, opponentTagLine } =
      req.params;
    const { region } = req.query;
    const platform = platformRegions[region];

    try {
      const [summonerData, opponentData] = await Promise.all([
        limiter.schedule(() =>
          fetchSummonerData(summonerName, summonerTagLine, platform)
        ),
        limiter.schedule(() =>
          fetchSummonerData(opponentName, opponentTagLine, platform)
        ),
      ]);

      const [summonerMatches, opponentMatches] = await Promise.all([
        limiter.schedule(() =>
          fetchSummonerMatches(summonerData.puuid, 200, platform)
        ),
        limiter.schedule(() =>
          fetchSummonerMatches(opponentData.puuid, 200, platform)
        ),
      ]);

      const commonMatches = findCommonMatches(summonerMatches, opponentMatches);

      if (commonMatches.length === 0) {
        throw new Error("Brak wspólnych meczów dla obu przywoływaczy.");
      }

      const opponentLeagueData = await limiter.schedule(() =>
        fetchOpponentLeagueData(opponentData.puuid, platform)
      );

      const matchDetails = await fetchMatchDetails(commonMatches, platform);

      const responseData = {
        opponentLeagueData,
        summonerData,
        opponentData,
        commonMatches,
        specificMatch: matchDetails,
      };

      res.json(responseData);
    } catch (error) {
      console.error("Error fetching data:", error.message);
      res.status(500).json({ error: "Error fetching data" });
    }
  }
);

async function fetchSummonerData(gameName, tagLine, platform) {
  const cacheKey = `${gameName}-${tagLine}`;
  if (summonerCache.has(cacheKey)) {
    console.log(`Cache hit for summoner data: ${cacheKey}`);
    return summonerCache.get(cacheKey);
  }
  const encodedTagLine = encodeURIComponent(tagLine);
  const url = `https://${platform.region}/riot/account/v1/accounts/by-riot-id/${gameName}/${encodedTagLine}`;
  logRequestDetails(url);
  const response = await axios.get(url, {
    headers: { "X-Riot-Token": API_KEY },
  });
  incrementRequestCount(url);
  summonerCache.set(cacheKey, response.data);
  return response.data;
}

async function fetchSummonerMatches(puuid, totalMatches = 100, platform) {
  let allMatches = [];
  const matchCountPerRequest = 100;
  let start = 0;

  while (allMatches.length < totalMatches) {
    const count = Math.min(
      matchCountPerRequest,
      totalMatches - allMatches.length
    );
    const url = `https://${platform.region}/lol/match/v5/matches/by-puuid/${puuid}/ids?start=${start}&count=${count}`;
    logRequestDetails(url);
    const response = await axios.get(url, {
      headers: { "X-Riot-Token": API_KEY },
    });
    incrementRequestCount(url);
    allMatches = allMatches.concat(response.data);
    start += matchCountPerRequest;

    if (response.data.length < matchCountPerRequest) {
      break;
    }
  }

  matchCache.set(puuid, allMatches);
  return allMatches;
}

async function fetchOpponentLeagueData(puuid, platform) {
  if (leagueCache.has(puuid)) {
    console.log(`Cache hit for league data: ${puuid}`);
    return leagueCache.get(puuid);
  }
  try {
    const summonerUrl = `https://${platform.url}/lol/summoner/v4/summoners/by-puuid/${puuid}`;
    logRequestDetails(summonerUrl);
    const summonerResponse = await axios.get(summonerUrl, {
      headers: { "X-Riot-Token": API_KEY },
    });
    incrementRequestCount(summonerUrl);
    const { id } = summonerResponse.data;

    const leagueUrl = `https://${platform.url}/lol/league/v4/entries/by-summoner/${id}`;
    logRequestDetails(leagueUrl);
    const leagueResponse = await axios.get(leagueUrl, {
      headers: { "X-Riot-Token": API_KEY },
    });
    incrementRequestCount(leagueUrl);

    const leagueData = leagueResponse.data;
    leagueCache.set(puuid, leagueData);

    return leagueData;
  } catch (error) {
    console.error("Error fetching opponent league data:", error.message);
    return null;
  }
}

async function fetchMatchDetails(matchIds, platform) {
  const matchDetailsPromises = matchIds.map(async (matchId) => {
    if (matchCache.has(matchId)) {
      console.log(`Cache hit for match details: ${matchId}`);
      return matchCache.get(matchId);
    }
    const url = `https://${platform.region}/lol/match/v5/matches/${matchId}`;
    logRequestDetails(url);
    const response = await limiter.schedule(() =>
      axios.get(url, { headers: { "X-Riot-Token": API_KEY } })
    );
    incrementRequestCount(url);
    matchCache.set(matchId, response.data);
    return response.data;
  });
  return await Promise.all(matchDetailsPromises);
}

function findCommonMatches(matches1, matches2) {
  console.log(matches1.filter((match) => matches2.includes(match)));
  return matches1.filter((match) => matches2.includes(match));
}

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
