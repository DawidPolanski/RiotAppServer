require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const port = 3001;

app.use(cors());

const API_KEY = process.env.API_KEY;

app.get(
  "/summonerAndMatchData/:summonerName/:summonerTagLine/:opponentName/:opponentTagLine",
  async (req, res) => {
    const { summonerName, summonerTagLine, opponentName, opponentTagLine } =
      req.params;

    try {
      const [summonerData, opponentData, summonerMatches, opponentMatches] =
        await Promise.all([
          fetchSummonerData(summonerName, summonerTagLine),
          fetchSummonerData(opponentName, opponentTagLine),
          fetchSummonerMatches(summonerName, summonerTagLine),
          fetchSummonerMatches(opponentName, opponentTagLine),
        ]);

      const commonMatches = findCommonMatches(summonerMatches, opponentMatches);

      if (commonMatches.length === 0) {
        throw new Error("Brak wspólnych meczów dla obu przywoływaczy.");
      }
      const opponentLeagueData = await fetchOpponentLeagueData(
        opponentData.puuid
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
  const encodedTagLine = encodeURIComponent(tagLine);
  const response = await axios.get(
    `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${gameName}/${encodedTagLine}`,
    { headers: { "X-Riot-Token": API_KEY } }
  );
  return response.data;
}

async function fetchSummonerMatches(gameName, tagLine) {
  const summonerData = await fetchSummonerData(gameName, tagLine);
  const response = await axios.get(
    `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${summonerData.puuid}/ids?start=0&count=100`,
    { headers: { "X-Riot-Token": API_KEY } }
  );
  return response.data;
}

async function fetchOpponentLeagueData(puuid) {
  try {
    const summonerResponse = await axios.get(
      `https://eun1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
      { headers: { "X-Riot-Token": API_KEY } }
    );
    const { id } = summonerResponse.data;

    const leagueResponse = await axios.get(
      `https://eun1.api.riotgames.com/lol/league/v4/entries/by-summoner/${id}`,
      { headers: { "X-Riot-Token": API_KEY } }
    );

    const leagueData = leagueResponse.data;

    return leagueData;
  } catch (error) {
    console.error("Error fetching opponent league data:", error.message);
    return null;
  }
}

async function fetchMatchDetails(matchIds) {
  const matchDetailsPromises = matchIds.map(async (matchId) => {
    const response = await axios.get(
      `https://europe.api.riotgames.com/lol/match/v5/matches/${matchId}`,
      { headers: { "X-Riot-Token": API_KEY } }
    );
    return response.data;
  });
  return await Promise.all(matchDetailsPromises);
}

function findCommonMatches(matches1, matches2) {
  return matches1.filter((match) => matches2.includes(match));
}

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
