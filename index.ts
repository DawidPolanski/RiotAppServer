const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const port = 3001;

app.use(cors());

const API_KEY = process.env.API_KEY;

app.get("/summonerData", async (req, res) => {
  const { summoners } = req.query;

  try {
    const promises = summoners.map(async (summoner) => {
      const { gameName, tagLine } = summoner;
      const encodedTagLine = encodeURIComponent(tagLine);

      const response = await axios.get(
        `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${gameName}/${encodedTagLine}`,
        { headers: { "X-Riot-Token": API_KEY } }
      );

      return response.data;
    });

    const summonerData = await Promise.all(promises);
    res.json(summonerData);
  } catch (error) {
    console.error("Error fetching summoner data:", error.message);
    res.status(500).json({ error: "Error fetching summoner data" });
  }
});

app.get("/summonerMatch", async (req, res) => {
  const { puuids } = req.query;

  try {
    const promises = puuids.map(async (puuid) => {
      const response = await axios.get(
        `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=100`,
        { headers: { "X-Riot-Token": API_KEY } }
      );

      return response.data;
    });

    const summonerMatches = await Promise.all(promises);
    res.json(summonerMatches);
  } catch (error) {
    console.error("Error fetching summoner match data:", error.message);
    res.status(500).json({ error: "Error fetching summoner match data" });
  }
});

app.get("/specificMatch/:matchId", async (req, res) => {
  const { matchId } = req.params;

  try {
    const response = await axios.get(
      `https://europe.api.riotgames.com/lol/match/v5/matches/${matchId}`,
      { headers: { "X-Riot-Token": API_KEY } }
    );

    const specificMatch = response.data;
    res.json(specificMatch);
  } catch (error) {
    console.error("Error fetching specific match data:", error.message);
    res.status(500).json({ error: "Error fetching specific match data" });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
