import socketIO from 'socket.io-client';

//const name = "John The Bot";
const firstNames = ["John", "Larry", "Barry", "Sean", "Harry", "Lisa", "Lindsey", "Jennifer", "Kathy", "Linda"];
const lastNames = ["Smith", "Johnson", "Williams", "Jones", "Brown", "Miller", "Wilson"];
var nameStart = Math.floor(Math.random() * firstNames.length);
const PLAYERS_ON_QUEST = [
    //5 6 7 8 9 10 players
    [2, 3, 2, 3, 3],
    [2, 3, 4, 3, 4],
    [2, 3, 3, 4, 4],
    [3, 4, 4, 5, 5],
    [3, 3, 4, 5, 5],
    [3, 4, 4, 5, 5]
];

export class gameBot {
    constructor() {
        this.socketID = null;
        this.name = null;
        this.roomCode = null;
        this.role = null;
        this.team = 'undecided';
        this.character = 'undecided';
        this.leader = false;
        this.onQuest = false;
        this.questAction = 'undecided';
        this.action = 'undecided';
    };

    createBot(roomCode) {

        let bot = new gameBot();

        bot.roomCode = roomCode;

        bot.name = createBotName();

        var socket = createSocketConnection();

        bot.socketID = socket.id;
        //socket.emit("connection", socket);

        socket.emit("joinRoom", {
            roomCode: bot.roomCode,
            name: bot.name
        });

        bot.role = "Guest";

        if (bot.role === "Guest") {
            socket.emit("connectPlayer");
        }

        socket.on("updatePlayers", function (players) {
            //updatePlayers(players, name);
            //console.log("in Bot Class on updatePlayers: ");
            // console.log(players)
            // console.log(`my socket id is: ${socket.id}`)

            for (let i in players) {
                if (players[i].socketID === socket.id) {
                    //console.log(`my identity is: ${players[i].name}`)
                    //console.log(`my character is ${players[i].team}`)
                    bot.team = players[i].team;
                }
            }
        });

        socket.on("gameReady", function () {
            console.log("Bot Ready for Game!");
        });

        socket.on("acceptOrRejectTeam", function () {
            let botDecision = botDecisionQuest();
            socket.emit("questTeamDecision", {
                name: bot.name,
                decision: botDecision
            });

        });

        // Succeeding or Failing Quests
        socket.on('goOnQuest', function () {
            let botDecision = botQuestVote();
            socket.emit("questVote", {
                name: bot.name,
                decision: botDecision
            });
        });

        function botDecisionQuest() {
            var decision;

            if (bot.team === 'Evil') {
                decision = 'reject';
            } else {
                decision = 'accept';
            }

            return decision;
        }

        function botQuestVote() {
            var decision;

            if (bot.team === 'Evil') {
                decision = 'fail';
            } else {
                decision = 'succeed';
            }

            return decision;
        }

        function createBotName() {
            /**
             * Lets get the Name of the bot,
             * Completely Randomized
             * @property {"The Bot"} = Middle name to show client console that it is a bot
             * Will be removed later
             */
            var firstName = firstNames[(nameStart++) % (firstNames.length)];
            var lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
            var middleName = " The Bot ";

            var name = firstName;
            name.concat(middleName);

            console.log("Name is :");
            console.log(name);

            return name;
        }

        function createSocketConnection() {
            /*
            Socket Connection Portion
        */
            var clientIO = socketIO;
            var socket = clientIO.connect('http://localhost:3000');

            socket.on('connect', () => {
                console.log(`In gameBot Class: Socket ID: ${socket.id}`);
            });

            return socket;
        }

        socket.on('choosePlayersForQuest', function (data) {
            console.log(`Leader Bot: ${bot.leader}, ${bot.name}`);
            bot.leader = true;
            console.log(`Leader Bot: ${bot.leader}, ${bot.name}`);
            if (bot.leader === true && data.bool === true) {
                var currentQuestNum = data.currentQuestNum;
                var players = data.players;

                // console.log(`On Quest: ${currentQuestNum}`);
                // console.log(`Players: ${players}`);
                console.log(`number of players: ${players.length}`);
                var playersOnQuestNum = PLAYERS_ON_QUEST[players.length - 5][currentQuestNum - 1];

                for (var i = 0; i < playersOnQuestNum; i++) {
                    console.log(`Chose: ${players[i].name}`);
                    players[i].onQuest = true;
                    socket.emit("addPlayerToQuest", players[i].name);
                    socket.emit('updatePlayers')
                }
                bot.leader = false;
                socket.emit('questTeamConfirmed');
            }
        })
    }

};