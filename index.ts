require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const port = 3001;

app.use(cors());

const API_KEY = process.env.API_KEY;

// const region = "EUN1";

app.get("/summonerData/:gameName/:tagLine", async (req, res) => {
  const { gameName, tagLine } = req.params;

  try {
    const encodedTagLine = encodeURIComponent(tagLine);

    const response = await axios.get(
      `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${gameName}/${encodedTagLine}`,
      { headers: { "X-Riot-Token": API_KEY } }
    );
    const summonerData = response.data;
    res.json(summonerData);
  } catch (error) {
    console.error("Error fetching summoner data:", error.message);
    res.status(500).json({ error: "Error fetching summoner data" });
  }
});

app.get("/summonerMatch/:puuid", async (req, res) => {
  const { puuid } = req.params;

  try {
    const response = await axios.get(
      `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=30`,
      { headers: { "X-Riot-Token": API_KEY } }
    );
    const summonerMatch = response.data;
    res.json(summonerMatch);
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
