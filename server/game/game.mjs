import { objectToArray, shuffle, populateRoleList } from './utility.mjs';
import Quest from './quest.mjs';
import QuestHistory from './history.mjs';

export const GoodTeam = new Set(['Merlin', 'Loyal Servant of Arthur', 'Percival']);

// defines what type of characters for size of game
// key: number of players
// value: object of characters and how many
const BaseCharacters = {
  5: {
    'Merlin': 1,
    'Assassin': 1,
    'Loyal Servant of Arthur': 2,
    'Minion of Mordred': 1
  },
  6: {
    'Merlin': 1,
    'Assassin': 1,
    'Loyal Servant of Arthur': 3,
    'Minion of Mordred': 1
  },
  7: {
    'Merlin': 1,
    'Assassin': 1,
    'Loyal Servant of Arthur': 3,
    'Minion of Mordred': 2
  },
  8: {
    'Merlin': 1,
    'Assassin': 1,
    'Loyal Servant of Arthur': 4,
    'Minion of Mordred': 2
  },
  9: {
    'Merlin': 1,
    'Assassin': 1,
    'Loyal Servant of Arthur': 5,
    'Minion of Mordred': 2
  },
  10: {
    'Merlin': 1,
    'Assassin': 1,
    'Loyal Servant of Arthur': 5,
    'Minion of Mordred': 3
  }
};

export default class Game {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.challengeMode = "OFF";
    this.gameIsStarted = false;
    this.gameState = {
      questMsg: null,
      acceptOrRejectTeam: false,
      succeedOrFailQuest: false
    };
    this.roleList = null;
    this.players = [];
    this.quests = null;
    this.questHistory = null;
    this.leaderIndex = 0;
  }

  initializeQuests() {
    console.log(`initializing quests. total players: ${this.players.length}`);
    this.quests = {
      1: new Quest(1, this.players.length),
      2: new Quest(2, this.players.length),
      3: new Quest(3, this.players.length),
      4: new Quest(4, this.players.length),
      5: new Quest(5, this.players.length)
    };
    this.quests[1].currentQuest = true;
    this.initializeQuestHistory();
  }

  initializeQuestHistory() {
    this.questHistory = {
      //key: quest
      1: {
        //key: vote track
        1: new QuestHistory(1),
      },
      2: {
        1: new QuestHistory(2),
      },
      3: {
        1: new QuestHistory(3),
      },
      4: {
        1: new QuestHistory(4),
      },
      5: {
        1: new QuestHistory(5),
      },
    }
  }

  getCurrentQuest() {
    for (let i in this.quests) {
      if (this.quests[i].currentQuest === true) {
        return this.quests[i];
      }
    }
  }

  // getter for PlayerIdentities
  static get BaseCharacters() {
    return BaseCharacters;
  }

  // getter for GoodTeam
  static get GoodTeam() {
    return GoodTeam;
  }

  hasPlayerWithName(name) {
    return this.players.some(player => player.name === name);
  }

  addPlayerToQuest(questNum, name) {
    for (let i in this.players) {
      if (this.players[i].name === name && this.quests[questNum].playersNeededLeft > 0) {
        this.players[i].onQuest = true;
        this.quests[questNum].addPlayer(name);
        break;
      }
    }
  }

  removePlayerFromQuest(questNum, name) {
    for (let i in this.players) {
      if (this.players[i].name === name) {
        this.players[i].onQuest = false;
        this.quests[questNum].removePlayer(name);
        break;
      }
    }
  }

  getPlayer({ socketID, name, role, character }) {
    return this.players.find(player =>
      player.socketID === socketID || player.name === name || player.role === role || player.character === character
    );
  }

  deletePlayer(socketID) {
    for (let i in this.players) {
      if (this.players[i].socketID === socketID) {
        console.log(`removing player from room: ${this.roomCode}`);
        this.players.splice(i, 1); //delete 1 player element at index i
        break;
      }
    }
  }

  assignFirstLeader() {
    // const randomNumber = Math.floor(Math.random() * Math.floor(this.players.length));
    for (let i in this.players) {
      if (this.players[i] != null) {
        this.players[i].leader = true;
        this.leaderIndex = i;
        this.quests[1].assignLeaderInfo({ name: this.players[i].name, socketID: this.players[i].socketID });
        break;
      }
    }
  }

  //assign next room leader (goes in order incrementally always)
  assignNextLeader(questNum) {
    this.players[this.leaderIndex].leader = false; //reset prev leader Player object
    this.resetPlayersProperty('onQuest');
    this.quests[questNum].resetQuest();

    //increment leaderIndex (mod by playerLength so it wraps around)
    this.leaderIndex = (this.leaderIndex + 1) % this.players.length;

    //continue incrementing leaderIndex until we find next non-null player object
    while (this.players[this.leaderIndex] === null) {
      this.leaderIndex = (this.leaderIndex + 1) % this.players.length;
    }
    //assign new leader to correct Player
    this.players[this.leaderIndex].leader = true;
    this.quests[questNum].assignLeaderInfo({
      name: this.players[this.leaderIndex].name,
      socketID: this.players[this.leaderIndex].socketID
    });
  }

  assignIdentities(optionalCharacters) {
    let shuffledIdentities;
    let teamObj = Game.BaseCharacters[this.players.length];

    if (optionalCharacters.length > 0) {
      teamObj = JSON.parse(JSON.stringify(Game.BaseCharacters[this.players.length]));
      optionalCharacters.forEach(optionalCharacter => {
        switch (optionalCharacter) {
          case 'Percival':
            teamObj['Loyal Servant of Arthur']--;
            teamObj['Percival'] = 1;
            break;
          case 'Mordred':
            teamObj['Minion of Mordred']--;
            teamObj['Mordred'] = 1;
            break;
          case 'Oberon':
            teamObj['Minion of Mordred']--;
            teamObj['Oberon'] = 1;
            break;
          case 'Morgana':
            teamObj['Minion of Mordred']--;
            teamObj['Morgana'] = 1;
            break;
        }
      });
    }
    this.roleList = populateRoleList(teamObj);
    shuffledIdentities = shuffle(objectToArray(teamObj));
    for (let i in this.players) {
      this.players[i].character = shuffledIdentities[i]; // assign character to player
      this.players[i].team = Game.GoodTeam.has(shuffledIdentities[i]) ? 'Good' : 'Evil'; // assign team based on character
    }
  }

  resetPlayersProperty(property) {
    this.players.forEach(player => {
      player[property] = false;
    });
  }

  saveQuestHistory(questNum, currentQuest) {
    //console.log(this.questHistory[questNum][currentQuest.voteTrack]);
    if (this.questHistory[questNum][currentQuest.voteTrack] === undefined) {
      console.log('exceeded 1 votetrack, creating new history obj');
      this.questHistory[questNum][currentQuest.voteTrack] = new QuestHistory(currentQuest.questNum);
    }
    this.questHistory[questNum][currentQuest.voteTrack].playersOnQuest = Array.from(currentQuest.playersOnQuest);
    this.questHistory[questNum][currentQuest.voteTrack].voteTrack = currentQuest.voteTrack;
    this.questHistory[questNum][currentQuest.voteTrack].leader = currentQuest.leaderInfo.name;
    if (currentQuest.questTeamDecisions.accept.length > currentQuest.questTeamDecisions.reject.length) {
      this.questHistory[questNum][currentQuest.voteTrack].questTeamDecisions.result = 'accepted';
    } else {
      this.questHistory[questNum][currentQuest.voteTrack].questTeamDecisions.result = 'rejected';
    }
    this.questHistory[questNum][currentQuest.voteTrack].questTeamDecisions.accept = currentQuest.questTeamDecisions.accept;
    this.questHistory[questNum][currentQuest.voteTrack].questTeamDecisions.reject = currentQuest.questTeamDecisions.reject;
    this.questHistory[questNum][currentQuest.voteTrack].votes.succeed = currentQuest.votes.succeed.length;
    this.questHistory[questNum][currentQuest.voteTrack].votes.fail = currentQuest.votes.fail.length;
    this.questHistory[questNum][currentQuest.voteTrack].success = currentQuest.success;
    console.log(`QUEST ${questNum} votetrack ${currentQuest.voteTrack} HISTORY: `);
    console.log(this.questHistory[questNum][currentQuest.voteTrack]);
  }

  //move to next quest out of 5
  startNextQuest(lastQuestNum) {
    if (lastQuestNum < 5) {
      this.quests[lastQuestNum].currentQuest = false;
      this.quests[lastQuestNum + 1].currentQuest = true;
      this.assignNextLeader(lastQuestNum + 1);
    }
    else {
      console.log("Game over: Reached last quest.");
    }
  }

  //called after each quest is completed
  //tally all quests successes/fails
  tallyQuests() {
    let successCount = 0;
    let failCount = 0;

    for (let i in this.quests) {
      if (this.quests[i].success === null) continue;
      if (this.quests[i].success) {
        successCount++;
      }
      else if (!this.quests[i].success) {
        failCount++;
      }
    }
    return ({
      successes: successCount,
      fails: failCount
    });
  }

};
