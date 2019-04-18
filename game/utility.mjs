import { GoodTeam } from './game.mjs';

// hide all player team and character info but yourself
export function sanitizeForGoodTeam(yourSocketID, players) {
    const clonedPlayers = JSON.parse(JSON.stringify(players));

    for (const i in clonedPlayers) {
        if (clonedPlayers[i].socketID === yourSocketID) {
            // dont hide your own info
            continue;
        } else {
            // hide everyone else's info
            clonedPlayers[i].character = 'hidden';
            clonedPlayers[i].team = 'hidden';
        }
    }
    return clonedPlayers;
}

export function sanitizeForPercival(yourSocketID, players) {
    const clonedPlayers = JSON.parse(JSON.stringify(players));

    for (const i in clonedPlayers) {
        if (clonedPlayers[i].socketID === yourSocketID) {
            // dont hide your own info
            continue;
        } else if (
            clonedPlayers[i].character == 'Merlin' ||
            clonedPlayers[i].character == 'Morgana'
        ) {
            //Merlin & Morgana both appear to be Merlin
            clonedPlayers[i].character = 'Merlin';
            clonedPlayers[i].team = 'Good';
        } else {
            // hide everyone else's info
            clonedPlayers[i].character = 'hidden';
            clonedPlayers[i].team = 'hidden';
        }
    }
    return clonedPlayers;
}

// hide identities of good team & Oberon
export function sanitizeForEvilTeam(yourSocketID, players) {
    const clonedPlayers = JSON.parse(JSON.stringify(players));

    for (const i in clonedPlayers) {
        if (clonedPlayers[i].socketID === yourSocketID) {
            // dont hide your own info
            continue;
        } else if (
            GoodTeam.has(clonedPlayers[i].character) ||
            clonedPlayers[i].character == 'Oberon'
        ) {
            // hide good team's info (& Oberon)
            clonedPlayers[i].character = 'hidden';
            clonedPlayers[i].team = 'hidden';
        } else {
            //just hide character of your teammates
            clonedPlayers[i].character = 'hidden';
        }
    }
    return clonedPlayers;
}

// hide identities of good team & Morgana
export function sanitizeForMerlin(yourSocketID, players) {
    const clonedPlayers = JSON.parse(JSON.stringify(players));

    for (const i in clonedPlayers) {
        if (clonedPlayers[i].socketID === yourSocketID) {
            // dont hide your own info
            continue;
        } else if (
            GoodTeam.has(clonedPlayers[i].character) ||
            clonedPlayers[i].character == 'Mordred'
        ) {
            // hide good team's info (& Oberon)
            clonedPlayers[i].character = 'hidden';
            clonedPlayers[i].team = 'hidden';
        } else {
            //just hide character of your teammates
            clonedPlayers[i].character = 'hidden';
        }
    }
    return clonedPlayers;
}

//check to make sure chosen optional characters works for number of players
//if 5 or 6 players, cannot have more than 1 of Mordred, Oberon, and Morgana
export function validateOptionalCharacters(characters, numPlayers) {
    console.log(characters);
    console.log(numPlayers);
    if (numPlayers <= 6 &&
        ((characters.includes("Mordred") && characters.includes("Oberon")) ||
            characters.includes("Mordred") && characters.includes("Morgana")) ||
        characters.includes("Oberon") && characters.includes("Morgana")) {
        return `Error: game with 5 or 6 players can only include 1 of Mordred, 
              Oberon, or Morgana. Please select only one then click Start Game again.`;
    } else if (
        numPlayers > 6 &&
        numPlayers < 10 &&
        characters.includes("Mordred") &&
        characters.includes("Oberon") &&
        characters.includes("Morgana")
    ) {
        return `Error: game with 7, 8, or 9 players can only include 2 of Mordred, 
              Oberon, or Morgana. Please de-select one then click Start Game again.`;
    } else {
        return ""
    }
}

// Fisher-Yates shuffle
export function shuffle(array) {
    let currentIndex = array.length;
    let temporaryValue;
    let randomIndex;

    // While there remain elements to shuffle...
    while (currentIndex !== 0) {
        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;
        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }
    return array;
}

//convert the object to array for shuffling
export function objectToArray(team) {
    let arr = []
    for (let character in team) {
        for (var i = 0; i < team[character]; i++) {
            arr.push(character)
        }
    }
    return arr;
}