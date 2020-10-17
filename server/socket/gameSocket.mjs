import { createRoom, joinRoom, spectateRoom, validateOptionalRoles } from './roomSocket.mjs';
import { sanitizeTeamView } from '../game/utility.mjs';
import GameBot from '../game/gameBot.mjs';

export let Games = {}; //keeps record of all game objects

/**
 * @param {Object} io
 * @param {Object} socket
 * @param {number} port
 * @param {number} roomCode
 * @param {string} playerName
 * @param {boolean} reconnect
 */
export function gameSocket(io, socket, port) {
  Promise.race([createRoom(io, socket), joinRoom(io, socket), spectateRoom(io, socket)])
    .then(({ playerName, roomCode, reconnect }) => {
      let game = Games[roomCode];

      socket.on('createBot', function () {
        if (!game.isStarted && game.getPlayer('socketID', socket.id).isRoomHost) {
          new GameBot(roomCode, port).listen();
        }
      });

      /**
       * @param {Object} msg
       */
      socket.on('updateChat', (msg) => {
        game.chat.push(msg);
        io.in(roomCode).emit('updateChat', msg);
      });

      /**
       * @param {array} specialRoles
       */
      socket.on('updateSpecialRoles', (specialRoles) => {
        game.specialRoles = specialRoles;
        io.in(roomCode).emit('updateSpecialRoles', specialRoles);
      });

      socket.on('startGame', function () {
        const errorMsg = validateOptionalRoles(game.specialRoles, game.players.length);
        if (errorMsg) return socket.emit('updateErrorMsg', errorMsg);

        game.startGame();
        updatePlayerCards();
        socket.emit('showSetupOptionsBtn', false);
        socket.emit('showLobbyBtn', false);
        io.in(roomCode).emit('startGame', true);
        io.in(roomCode).emit('setRoleList', game.roleList);
        io.in(roomCode).emit('initQuests', game.quests);
        leaderChoosesQuestTeam();
      });

      /**
       * @param {string} action
       * @param {string} playerName
       */
      socket.on('addRemovePlayerFromQuest', function (action, playerName) {
        if (!game.addRemovePlayerFromQuest(action, playerName)) return;

        updatePlayerCards();
        let { leaderInfo, playersNeededLeft, questNum } = game.getCurrentQuest();
        if (playersNeededLeft > 0) {
          updateGameStatus(`${leaderInfo.name} is choosing ${playersNeededLeft} more player(s)
                      to go on quest ${questNum}`);
          socket.emit('showConfirmTeamBtnToLeader', false);
        } else {
          updateGameStatus(`Waiting for ${leaderInfo.name} to confirm team.`);
          socket.emit('showConfirmTeamBtnToLeader', true);
        }
      });

      socket.on('leaderHasConfirmedTeam', function () {
        socket.emit('showConfirmTeamBtnToLeader', false);
        socket.emit('showAddRemovePlayerBtns', false);
        game.getCurrentQuest().leaderHasConfirmedTeam = true;

        game.gameState['showAcceptOrRejectTeamBtns'] = true;
        updateGameStatus('Waiting for all players to Accept or Reject team.');
        io.in(roomCode).emit('hidePreviousVoteResults');

        game.players.forEach(player => {
          io.to(player.socketID).emit('showAcceptOrRejectTeamBtns', true);
        })
      });

      /**
       * @param {string} decision 
       */
      socket.on('playerAcceptsOrRejectsTeam', function (decision) {
        if (!game.addVote('team', socket.id, decision)) return;

        socket.emit('showAcceptOrRejectTeamBtns', false);
        let currentQuest = game.getCurrentQuest();
        updateGameStatus(`Waiting for ${currentQuest.teamVotesNeededLeft} more player(s) to Accept or Reject team.`);

        //everyone has voted, reveal the votes & move on
        if (currentQuest.teamVotesNeededLeft <= 0) {
          game.gameState['showAcceptOrRejectTeamBtns'] = false;
          game.assignTeamResult();
          revealVoteResults('team', currentQuest.acceptOrRejectTeam);
          io.in(roomCode).emit('updateBotRiskScores', currentQuest.questNum);

          if (currentQuest.teamAccepted) {
            showSucceedAndFailBtnsToPlayersOnQuest();
          } else {
            currentQuest.voteTrack++;
            game.gameOver() ? gameOver() : chooseNextQuestTeamAnd('assignNextLeader');
          }
        }
      });

      /**
       * @param {string} decision 
       */
      socket.on('questVote', function (decision) {
        if (!game.addVote('quest', socket.id, decision)) return;

        let currentQuest = game.getCurrentQuest();
        updateGameStatus(`Waiting for ${currentQuest.questVotesNeededLeft} more player(s) to go on quest.`);

        // all votes received
        if (currentQuest.questVotesNeededLeft <= 0) {
          game.gameState['showSucceedOrFailQuestBtns'] = false;
          revealVoteResults('quest', currentQuest.votes);
          io.in(roomCode).emit('updateBotRiskScores', currentQuest.questNum);
          io.in(roomCode).emit('updateQuest', game.assignQuestResult());
          game.gameOver() ? gameOver() : chooseNextQuestTeamAnd('startNextQuest');
        }
      });

      /**
       * @param {string} playerName 
       */
      socket.on('assassinatePlayer', function (playerName) {
        if (!game.assassinatePlayer(playerName)) return;

        if (game.winningTeam === 'Evil') {
          updateGameStatus(`Assassin successfully discovered and killed ${playerName}, who was Merlin. <br/>Evil wins!`);
        } else {
          updateGameStatus(`Assassin killed ${playerName}, who is not Merlin. <br/>Good wins!`);
        }
        socket.emit('showAssassinateBtn', false);
        io.in(roomCode).emit('updatePlayerCards', game.players);
        io.to(game.getPlayer('isRoomHost', true).socketID).emit('showLobbyBtn', true);
      });

      socket.on('disconnect', function () {
        if (Object.keys(Games).length === 0 || typeof game === 'undefined') return;

        if (game.getSpectator('socketID', socket.id)) return disconnectSpectator(roomCode, socket.id);
        else disconnectPlayer(socket.id);

        if (shouldAssignNextHost()) assignNextHost();
        updateLobbyStatus();
        updatePlayerCards();
        gameRoomCleanUp();
      });

      socket.on('resetGame', function () {
        io.in(roomCode).emit('startGame', false);
        io.in(roomCode).emit('hidePreviousVoteResults');
        io.to(game.getPlayer('isRoomHost', true).socketID).emit('showSetupOptionsBtn', true);
        game.resetGame();
        updatePlayerCards();
        updateLobbyStatus();
      });

      function updateLobbyStatus() {
        if (game.isStarted) return;

        if (game.players.length >= 5) {
          io.to(game.getPlayer('isRoomHost', true).socketID).emit('showStartGameBtn', true);
          updateGameStatus('Waiting for Host to start the game.');
        } else if (game.players.length > 0) {
          io.to(game.getPlayer('isRoomHost', true).socketID).emit('showStartGameBtn', false);
          updateGameStatus(`Waiting for ${5 - Games[roomCode].players.length} more player(s) to join.`);
        }
      }

      /**
       * @param {string} type - 'team' or 'quest'
       * @param {Object} votes 
       */
      function revealVoteResults(type, votes) {
        game.resetPlayersProperty('voted');
        io.in(roomCode).emit('revealVoteResults', { type, votes });
      }

      /**
       * @param {string} action
       */
      function chooseNextQuestTeamAnd(action) {
        if (action === 'assignNextLeader') {
          game.assignNextLeader();
        }
        else if (action === 'startNextQuest') {
          game.startNextQuest();
        }
        updatePlayerCards();
        leaderChoosesQuestTeam();
      }

      function leaderChoosesQuestTeam() {
        const { voteTrack, leaderInfo, playersNeededLeft, questNum, currentQuest } = game.getCurrentQuest();

        io.in(roomCode).emit('updateQuest', { questNum, currentQuest });
        io.in(roomCode).emit('updateVoteTrack', voteTrack);
        updateGameStatus(`${leaderInfo.name} is choosing ${playersNeededLeft} more player(s)
                    to go on quest ${questNum}`);
        console.log(`Current Quest: ${questNum}`);
        io.to(leaderInfo.socketID).emit('showAddRemovePlayerBtns', true);
      }

      function gameOver() {
        //good is on track to win, evil can attempt to assassinate merlin
        if (game.questSuccesses >= 3) {
          updateGameStatus(`Good has triumphed over Evil by succeeding ${game.questSuccesses} quests. 
                      <br/>Waiting for Assassin to attempt to assassinate Merlin.`)

          io.to(game.getPlayer('role', 'Assassin').socketID).emit('updateGameStatus',
            `You are the assassin. <br/> Assassinate the player you think is Merlin to win the game for evil.`);
          io.to(game.getPlayer('role', 'Assassin').socketID).emit('showAssassinateBtn', true);
          return;
        }

        if (game.questFails >= 3) {
          updateGameStatus(`${game.questFails} quests failed. Evil wins!`);
        }
        else if (game.getCurrentQuest().voteTrack > 5) {
          updateGameStatus(`Quest ${currentQuest.questNum} had 5 failed team votes. Evil wins!`);
        }
        io.in(roomCode).emit('updatePlayerCards', game.players);
        io.to(game.getPlayer('isRoomHost', true).socketID).emit('showLobbyBtn', true);
      }

      function showSucceedAndFailBtnsToPlayersOnQuest() {
        updateGameStatus('Waiting for quest team to go on quest.');
        game.gameState['showAcceptOrRejectTeamBtns'] = false;
        game.gameState['showSucceedOrFailQuestBtns'] = true;

        game.players.forEach(player => {
          if (player.onQuest && !player.voted) {
            const disableFailBtn = player.team === "Good"; //check if player is good so they can't fail quest
            io.to(player.socketID).emit('showSucceedOrFailQuestBtns', disableFailBtn);
          }
        });
      }

      function updatePlayerCards() {
        if (game.winningTeam !== null) {
          return io.in(roomCode).emit('updatePlayerCards', game.players);
        }
        game.players.forEach(player => {
          io.to(player.socketID).emit('updatePlayerCards', sanitizeTeamView(player.socketID, player.role, game.players));
        });
        game.spectators.forEach(spectator => {
          io.to(spectator.socketID).emit('updatePlayerCards', sanitizeTeamView(spectator.socketID, 'Spectator', game.players))
        });
      }

      /**
       * @param {string} msg 
       */
      function updateGameStatus(msg) {
        game.gameState['gameStatusMsg'] = msg;
        io.in(roomCode).emit('updateGameStatus', msg);
      }

      /**
       * @param {string} msg 
       */
      function updateServerChat(msg) {
        const msgObj = { id: Date.now(), serverMsg: msg };
        game.chat.push(msgObj);
        io.in(roomCode).emit('updateChat', msgObj);
      }

      function shouldAssignNextHost() {
        return !game.isStarted && !game.getPlayer('isRoomHost', true) && game.players.length > 0;
      }

      function assignNextHost() {
        const newHost = game.assignNextHost();
        io.to(newHost.socketID).emit('showSetupOptionsBtn', true);
        updateServerChat(`${newHost.name} has become the new host.`);
      }

      /**
       * @param {number} roomCode 
       * @param {string} socketID 
       */
      function disconnectSpectator(roomCode, socketID) {
        updateServerChat(`${game.getSpectator('socketID', socketID).name} has stopped spectating the game.`);
        game.deletePersonFrom('spectators', socketID);
        io.in(roomCode).emit('updateSpectatorsList', game.spectators);
      }

      /**
       * @param {string} socketID
       */
      function disconnectPlayer(socketID) {
        updateServerChat(`${game.getPlayer('socketID', socketID).name} has disconnected.`);
        if (game.isStarted) {
          game.getPlayer('socketID', socketID).disconnected = true;
        } else {
          game.deletePersonFrom('players', socketID);
        }
      }

      function gameRoomCleanUp() {
        if (game.players.length > 0 && game.players.some(player => !player.disconnected)) return;

        console.log(`all players disconnected from room ${roomCode}`);
        io.in(roomCode).emit('windowReload');
        game.deleteRoomTimeout = setTimeout(function(){
          console.log(`no activity for 2 minutes, deleting room ${roomCode}`);
          delete Games[roomCode];
        }, 120000);
      }

      if (reconnect) {
        console.log(`\nreconnecting ${playerName} to room ${roomCode}`)
        let player = game.getPlayer('name', playerName);
        player.reconnect(socket.id);

        socket.emit('goToGame', { playerName, roomCode });
        socket.join(roomCode);
        socket.emit('initChat', { msgs: game.chat, showMsgInput: true });
        updateServerChat(`${playerName} has reconnected.`);
        socket.emit('startGame', true);
        socket.emit('setRoleList', game.roleList);
        updatePlayerCards();

        let currentQuest = game.getCurrentQuest();
        socket.emit('updateSpectatorsList', game.spectators);
        socket.emit('initQuests', game.quests);
        socket.emit('updateGameStatus', game.gameState['gameStatusMsg']);
        socket.emit('updateVoteTrack', currentQuest.voteTrack);

        if (game.winningTeam !== null) {
          socket.emit('showLobbyBtn', true);
        }

        if (game.gameState['showAcceptOrRejectTeamBtns'] && !player.voted) {
          socket.emit('showAcceptOrRejectTeamBtns', true);
        } else if (currentQuest.teamVotesNeededLeft <= 0) {
          socket.emit('revealVoteResults', { type: 'team', votes: currentQuest.acceptOrRejectTeam });
        }

        if (game.gameState['showSucceedOrFailQuestBtns'] && !player.voted) {
          showSucceedAndFailBtnsToPlayersOnQuest();
        } else if (currentQuest.questVotesNeededLeft <= 0) {
          socket.emit('revealVoteResults', { type: 'quest', votes: currentQuest.votes });
        }

        if (currentQuest.leaderInfo.name === playerName && !currentQuest.leaderHasConfirmedTeam) {
          currentQuest.leaderInfo.socketID = socket.id;
          socket.emit('showAddRemovePlayerBtns', true);
          socket.emit('showConfirmTeamBtnToLeader', false);
        }
        if (currentQuest.leaderInfo.name === playerName && currentQuest.playersNeededLeft <= 0 && !currentQuest.leaderHasConfirmedTeam) {
          socket.emit('showConfirmTeamBtnToLeader', true);
        }
        if (game.questSuccesses >= 3 && game.winningTeam === null && player.role === 'Assassin') {
          socket.emit('updateGameStatus', `You are the assassin. <br/> 
                  Assassinate the player you think is Merlin to win the game for evil.`);
          socket.emit('showAssassinateBtn', true);
        }
      }
    });
}