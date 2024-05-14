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

    try {
      const [summonerData, opponentData] = await Promise.all([
        limiter.schedule(() =>
          fetchSummonerData(summonerName, summonerTagLine)
        ),
        limiter.schedule(() =>
          fetchSummonerData(opponentName, opponentTagLine)
        ),
      ]);

      const [summonerMatches, opponentMatches] = await Promise.all([
        limiter.schedule(() => fetchSummonerMatches(summonerData.puuid, 200)),
        limiter.schedule(() => fetchSummonerMatches(opponentData.puuid, 200)),
      ]);

      const commonMatches = findCommonMatches(summonerMatches, opponentMatches);

      if (commonMatches.length === 0) {
        throw new Error("Brak wspólnych meczów dla obu przywoływaczy.");
      }

      const opponentLeagueData = await limiter.schedule(() =>
        fetchOpponentLeagueData(opponentData.puuid)
      );

      const matchDetails = await fetchMatchDetails(commonMatches);

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

async function fetchSummonerData(gameName, tagLine) {
  const cacheKey = `${gameName}-${tagLine}`;
  if (summonerCache.has(cacheKey)) {
    console.log(`Cache hit for summoner data: ${cacheKey}`);
    return summonerCache.get(cacheKey);
  }
  const encodedTagLine = encodeURIComponent(tagLine);
  const url = `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${gameName}/${encodedTagLine}`;
  logRequestDetails(url);
  const response = await axios.get(url, {
    headers: { "X-Riot-Token": API_KEY },
  });
  incrementRequestCount(url);
  summonerCache.set(cacheKey, response.data);
  return response.data;
}

async function fetchSummonerMatches(puuid, totalMatches = 100) {
  let allMatches = [];
  const matchCountPerRequest = 100;
  let start = 0;

  while (allMatches.length < totalMatches) {
    const count = Math.min(
      matchCountPerRequest,
      totalMatches - allMatches.length
    );
    const url = `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=${start}&count=${count}`;
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

async function fetchOpponentLeagueData(puuid) {
  if (leagueCache.has(puuid)) {
    console.log(`Cache hit for league data: ${puuid}`);
    return leagueCache.get(puuid);
  }
  try {
    const summonerUrl = `https://eun1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
    logRequestDetails(summonerUrl);
    const summonerResponse = await axios.get(summonerUrl, {
      headers: { "X-Riot-Token": API_KEY },
    });
    incrementRequestCount(summonerUrl);
    const { id } = summonerResponse.data;

    const leagueUrl = `https://eun1.api.riotgames.com/lol/league/v4/entries/by-summoner/${id}`;
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

async function fetchMatchDetails(matchIds) {
  const matchDetailsPromises = matchIds.map(async (matchId) => {
    if (matchCache.has(matchId)) {
      console.log(`Cache hit for match details: ${matchId}`);
      return matchCache.get(matchId);
    }
    const url = `https://europe.api.riotgames.com/lol/match/v5/matches/${matchId}`;
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
