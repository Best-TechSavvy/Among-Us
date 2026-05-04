# 🚀 Among Us IRL

A local multiplayer web-based game bringing the popular Among Us gameplay into real life. Players complete physical and cognitive tasks while trying to identify who the imposters are. Perfect for team-building events, parties, and group activities!

## 📋 Table of Contents

- [Features](#features)
- [How It Works](#how-it-works)
- [Installation](#installation)
- [Usage](#usage)
- [Game Roles](#game-roles)
- [Tasks](#tasks)
- [Project Structure](#project-structure)
- [Technologies](#technologies)

## ✨ Features

- **Local Multiplayer Gameplay** - Support for multiple players in a single game session
- **Customizable Task Bank** - Add, edit, and manage tasks that players must complete
- **Host Controls** - Game host can manage players, settings, and game flow
- **Projector Display** - Large screen display for announcements and game information
- **Real-time Communication** - WebSocket-based instant updates using Socket.IO
- **Voting Meetings** - Players vote to identify and eliminate imposters
- **Game State Management** - Complete tracking of player roles, tasks, and game progress
- **Session Codes** - Easy player joining with lobby names

## 🎮 How It Works

### Game Flow

1. **Host Creates Lobby** - Game host sets up a new game session and receives a lobby code
2. **Players Join** - Other players join using the lobby code and their names
3. **Game Starts** - Host initiates the game:
   - Players are randomly assigned as Crew Members or Imposters
   - Each player receives a list of tasks to complete
4. **Task Phase** - Players work on their assigned tasks:
   - Crew Members must complete their tasks correctly
   - Imposters pretend to work but actually try to sabotage
   - Projector displays progress announcements
5. **Meetings** - Emergency meetings are called:
   - Players discuss and debate who the imposters are
   - Voting determines who gets eliminated
6. **Win Conditions**:
   - **Crew Wins** - All imposters are eliminated OR all tasks are completed
   - **Imposters Win** - Imposters equal or outnumber crew members

### Key Roles

- **Crew Members** - Complete assigned tasks to win; must identify imposters
- **Imposters** - Sabotage the game; remain hidden to win
- **Host** - Controls game settings and progression
- **Projector** - Displays announcements and game information on a large screen

## 🚀 Installation

### Requirements

- Node.js 14 or higher
- npm (Node Package Manager)

### Setup Steps

1. **Clone or download this repository**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```
   The server will run on `http://localhost:3000` (or your configured PORT)

4. **Open in browser**
   - Navigate to `http://localhost:3000`
   - Use `localhost:3000` on your computer/projector for the game

## 🎯 Usage

### For the Host

1. Open the game on your device
2. Click **"Create Lobby"** and enter your name
3. Share the lobby code with other players
4. Configure game settings:
   - Number of players
   - Number of imposters
   - Tasks per player
   - Voting duration
5. Click **"Start Game"** when ready
6. Monitor the game and call meetings as needed

### For Players

1. Open the game in a browser
2. Click **"Join Lobby"**
3. Enter your name and the lobby code
4. Wait for the host to start the game
5. Complete your assigned tasks (or pretend to if you're an imposter)
6. Participate in voting meetings when called

### For the Projector

1. Open the game on a device connected to your projector
2. Enter the projector code (provided by the host)
3. The projector displays:
   - Current game announcements
   - Player progress
   - Voting information
   - Meeting details

## 📝 Tasks

The task bank includes various activities:

- **Maze Task** - Navigate a maze and collect letters in sequence
- **Wiring Task** - Connect wires to light up LEDs in correct order
- **Scavenger Hunt Task** - Follow directions to collect letters hidden around the venue
- **Collaborative Story Writing** - Add sentences to a story and receive a completion code

### Customizing Tasks

Tasks are stored in `taskBank.json`. Each task includes:
- `taskId` - Unique identifier
- `title` - Task name
- `instructions` - Details of what to do
- `completionCode` - Code players submit to verify completion
- `active` - Whether the task is available in games

Hosts can add, edit, or delete tasks through the game interface.

## 📁 Project Structure

```
Among-Us/
├── server.js              # Express server with Socket.IO
├── gameState.js           # Game logic and state management
├── gameState.json         # Persistent game state
├── taskBank.json          # Customizable task definitions
├── package.json           # Dependencies and project metadata
├── README.md              # This file
└── public/
    ├── index.html         # Main HTML interface
    ├── app.js             # Client-side Socket.IO logic
    └── style.css          # Styling and layout
```

## 🛠 Technologies

- **Backend**: Node.js with Express.js
- **Real-time Communication**: Socket.IO
- **Frontend**: HTML5, CSS, JavaScript
- **Data Storage**: JSON files

## 📌 Notes

- This game is designed for local play on a single network
- All game data is stored locally in JSON files
- Sessions persist on the server until manually ended
- Perfect for 4-15 players

## 🤝 Contributing

Feel free to customize tasks, add new features, or modify the gameplay to suit your event!

---

**Enjoy your Among Us IRL experience! 🚀**
