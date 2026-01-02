const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
    cors: { origin: "*" }
});

app.use(express.static("public"));

let players = {};
let currentQuestion = null;
let answers = [];
let acceptingAnswers = false;
let timer = null;

io.on("connection", socket => {

    console.log("Client connected:", socket.id);

    socket.on("join_player", name => {
        name = (name || "").trim();
        if (!name) return;

        players[socket.id] = { name, score: 0 };
        io.emit("players_update", players);
    });

    socket.on("host_question", q => {

        // reset state
        answers = [];
        acceptingAnswers = true;

        currentQuestion = {
            text: q.text,
            options: q.options,
            correct: q.correct.trim().toUpperCase()
        };

        console.log("Question sent", currentQuestion);

        // send question to players
        io.emit("new_question", currentQuestion);

        // send timer start to players
        io.emit("timer_start", { seconds: 30 });

        // stop after 30 sec
        clearTimeout(timer);
        timer = setTimeout(() => {
            acceptingAnswers = false;
            finishQuestion("Time Up");
        }, 30000);
    });

    socket.on("player_answer", data => {
        if (!acceptingAnswers || !currentQuestion) return;

        const answer = (data.answer || "").toUpperCase();

        if (answers.find(a => a.id === socket.id)) return;

        answers.push({ id: socket.id, answer, time: Date.now() });

        evaluateLive();
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
        io.emit("players_update", players);
    });
});

function evaluateLive() {

    const correct = currentQuestion.correct;

    const correctAnswers = answers
        .filter(a => a.answer === correct)
        .sort((a, b) => a.time - b.time);

    if (correctAnswers.length === 0) return;

    // stop accepting as soon as winner found
    acceptingAnswers = false;
    clearTimeout(timer);

    const winner = correctAnswers[0];
    players[winner.id].score++;

    finishQuestion(players[winner.id].name);
}

function finishQuestion(winnerName) {

    io.emit("result", {
        winner: winnerName,
        correct: currentQuestion.correct,
        players
    });

    currentQuestion = null;
}

http.listen(3000, () =>
    console.log("Server running at http://localhost:3000")
);
