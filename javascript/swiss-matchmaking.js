// Swiss Matchmaking System for Events
// Handles 2-10 player tournaments with proper Swiss pairing logic

class SwissMatchmaker {
    constructor() {
        this.POINTS_WIN = 3;
        this.POINTS_DRAW = 1;
        this.POINTS_LOSS = 0;
        this.POINTS_BYE = 3; // Bye counts as a win
    }

    /**
     * Calculate total rounds needed for Swiss tournament
     * @param {number} numPlayers - Number of paid participants
     * @returns {number} Total rounds
     */
    calculateRounds(numPlayers) {
        if (numPlayers < 2) return 0;
        if (numPlayers === 2) return 1; // Direct match
        if (numPlayers === 3) return 3; // Round-robin style
        if (numPlayers >= 4 && numPlayers <= 6) return 3;
        if (numPlayers >= 7 && numPlayers <= 10) return 4;
        return Math.ceil(Math.log2(numPlayers)); // Fallback for larger tournaments
    }

    /**
     * Calculate standings with tiebreakers
     * @param {Array} participants - Array of participant objects
     * @param {Array} previousResults - Array of completed match results
     * @returns {Array} Sorted standings array
     */
    calculateStandings(participants, previousResults = []) {
        console.log('[Swiss Debug] calculateStandings called with:', { participants, previousResults });
        
        const standings = participants.map(participant => {
            const userId = participant.userId || participant.id;
            const name = participant.name || participant.userName || 'Unknown';
            
            let wins = 0;
            let losses = 0;
            let draws = 0;
            let byes = 0;
            let totalPoints = 0;
            const opponents = new Set();

            console.log(`[Swiss Debug] Processing participant: ${name} (${userId})`);

            // Count results for this participant
            previousResults.forEach(match => {
                if (match.status !== 'completed') return;

                const isPlayer1 = match.player1 === userId;
                const isPlayer2 = match.player2 === userId;
                
                if (!isPlayer1 && !isPlayer2) return;
                
                console.log(`[Swiss Debug] ${name} found in match:`, match);

                if (match.result === 'bye') {
                    if (isPlayer1 || isPlayer2) {
                        byes++;
                        totalPoints += this.POINTS_BYE;
                    }
                } else if (match.result === 'draw') {
                    draws++;
                    totalPoints += this.POINTS_DRAW;
                    // Add opponent for OWP calculation
                    if (isPlayer1) opponents.add(match.player2);
                    if (isPlayer2) opponents.add(match.player1);
                } else if (match.result === 'player1') {
                    if (isPlayer1) {
                        wins++;
                        totalPoints += this.POINTS_WIN;
                        opponents.add(match.player2);
                    } else {
                        losses++;
                        opponents.add(match.player1);
                    }
                } else if (match.result === 'player2') {
                    if (isPlayer2) {
                        wins++;
                        totalPoints += this.POINTS_WIN;
                        opponents.add(match.player1);
                    } else {
                        losses++;
                        opponents.add(match.player2);
                    }
                }
            });

            // Calculate Opponents' Match Win Percentage (OMW%)
            let owp = 0;
            if (opponents.size > 0) {
                const opponentWins = Array.from(opponents).map(opponentId => {
                    const opponent = participants.find(p => (p.userId || p.id) === opponentId);
                    if (!opponent) return 0;
                    
                    let oppWins = 0;
                    let oppMatches = 0;
                    previousResults.forEach(match => {
                        if (match.status !== 'completed') return;
                        const isOppPlayer1 = match.player1 === opponentId;
                        const isOppPlayer2 = match.player2 === opponentId;
                        
                        if (isOppPlayer1 || isOppPlayer2) {
                            // Exclude byes from opponent match win percentage
                            if (match.result === 'bye') return;
                            oppMatches++;
                            if (match.result === 'draw') {
                                oppWins += 0.5;
                            } else if ((match.result === 'player1' && isOppPlayer1) || 
                                     (match.result === 'player2' && isOppPlayer2)) {
                                oppWins++;
                            }
                        }
                    });
                    return oppMatches > 0 ? oppWins / oppMatches : 0;
                });
                owp = opponentWins.reduce((sum, winRate) => sum + winRate, 0) / opponentWins.length;
            }

            const playerStanding = {
                userId,
                name,
                wins,
                losses,
                draws,
                byes,
                totalPoints,
                owp,
                gamesPlayed: wins + losses + draws + byes,
                record: `${wins}-${losses}${draws > 0 ? `-${draws}` : ''}`
            };
            
            console.log(`[Swiss Debug] ${name} final standing:`, playerStanding);
            return playerStanding;
        });

        console.log('[Swiss Debug] All standings before sort:', standings);

        // Sort by: totalPoints desc, OMW% desc, name asc
        const sortedStandings = standings.sort((a, b) => {
            if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
            if (b.owp !== a.owp) return b.owp - a.owp;
            return a.name.localeCompare(b.name);
        });
        
        console.log('[Swiss Debug] Final sorted standings:', sortedStandings);
        return sortedStandings;
    }

    /**
     * Group standings by current record
     * @param {Array} standings - Sorted standings array
     * @returns {Object} Groups by record
     */
    groupByRecord(standings) {
        // Group by total points (Swiss brackets are by points), not literal record string
        const groups = {};
        standings.forEach(player => {
            const key = String(player.totalPoints);
            if (!groups[key]) groups[key] = [];
            groups[key].push(player);
        });
        return groups;
    }

    /**
     * Check if two players have played before
     * @param {string} playerA - First player ID
     * @param {string} playerB - Second player ID
     * @param {Array} previousResults - Array of completed matches
     * @returns {boolean} True if they have played before
     */
    hasPlayedBefore(playerA, playerB, previousResults) {
        return previousResults.some(match => 
            match.status === 'completed' && 
            ((match.player1 === playerA && match.player2 === playerB) ||
             (match.player1 === playerB && match.player2 === playerA))
        );
    }

    /**
     * Create pairings within record groups
     * @param {Object} groups - Groups by record
     * @param {number} currentRound - Current round number
     * @param {Array} previousResults - Previous match results
     * @returns {Array} Array of pairings
     */
    createPairings(groups, currentRound, previousResults) {
        const pairings = [];
        // Sort brackets by points descending
        const sortedKeys = Object.keys(groups).sort((a, b) => {
            const aPoints = groups[a][0]?.totalPoints || parseInt(a, 10) || 0;
            const bPoints = groups[b][0]?.totalPoints || parseInt(b, 10) || 0;
            return bPoints - aPoints;
        });

        // Make a mutable copy of each bracket preserving player order (standings already sorted)
        const brackets = sortedKeys.map(key => ({ key, players: [...groups[key]] }));

        for (let g = 0; g < brackets.length; g++) {
            const current = brackets[g];
            const next = brackets[g + 1];

            // If odd, float up the lowest-tiebreaker from next bracket if available
            if (current.players.length % 2 === 1 && next && next.players.length > 0) {
                // next.players is in high->low order; take the last (lowest tiebreaker)
                const floater = next.players.pop();
                current.players.push(floater);
            }

            // Pair within current bracket, avoiding rematches when possible
            const unpaired = [...current.players];
            while (unpaired.length >= 2) {
                const player1 = unpaired.shift();
                let foundIndex = -1;
                for (let i = 0; i < unpaired.length; i++) {
                    if (!this.hasPlayedBefore(player1.userId, unpaired[i].userId, previousResults)) {
                        foundIndex = i;
                        break;
                    }
                }
                // If every remaining is a rematch, take the first to ensure progress
                const opponent = foundIndex >= 0 ? unpaired.splice(foundIndex, 1)[0] : unpaired.shift();
                pairings.push({
                    player1: player1.userId,
                    player2: opponent.userId,
                    player1Name: player1.name,
                    player2Name: opponent.name
                });
            }

            // If one remains, try to bubble one more from below to complete pairing
            if (unpaired.length === 1 && brackets[g + 1] && brackets[g + 1].players.length > 0) {
                const player1 = unpaired.shift();
                const bubbled = brackets[g + 1].players.pop();
                pairings.push({
                    player1: player1.userId,
                    player2: bubbled.userId,
                    player1Name: player1.name,
                    player2Name: bubbled.name
                });
            }
        }

        return pairings;
    }

    /**
     * Handle odd numbers by assigning byes
     * @param {Array} pairings - Current pairings
     * @param {Array} standings - Current standings
     * @param {Array} previousResults - Previous match results
     * @returns {Object} { pairings, byes }
     */
    handleOddNumbers(pairings, standings, previousResults) {
        const totalPlayers = standings.length;
        const pairedPlayers = pairings.length * 2;
        const unpairedCount = totalPlayers - pairedPlayers;

        // Only assign a bye if the total number of players this round is odd
        if (totalPlayers % 2 === 0 || unpairedCount === 0) {
            return { pairings, byes: [] };
        }

        // Track players who already received a bye in earlier rounds
        const playersWithByes = new Set();
        previousResults.forEach(match => {
            if (match.result === 'bye') {
                if (match.player1) playersWithByes.add(match.player1);
                if (match.player2) playersWithByes.add(match.player2);
            }
        });

        // Find unpaired players (not in any current pairing)
        const unpairedPlayers = standings.filter(player => 
            !pairings.some(p => p.player1 === player.userId || p.player2 === player.userId)
        );

        // If exactly one unpaired player, they get the bye
        if (unpairedPlayers.length === 1) {
            return { pairings, byes: [unpairedPlayers[0].userId] };
        }

        // If multiple unpaired, choose the one who hasn't had a bye yet
        const unpairedEligible = unpairedPlayers.filter(player => 
            !playersWithByes.has(player.userId)
        );

        const byes = [];
        if (unpairedEligible.length > 0) {
            // Choose lowest-ranked eligible (already sorted by standings)
            byes.push(unpairedEligible[0].userId);
        } else if (unpairedPlayers.length > 0) {
            // Fallback: if everyone already had a bye, pick the lowest-ranked unpaired
            byes.push(unpairedPlayers[unpairedPlayers.length - 1].userId);
        }

        return { pairings, byes };
    }

    /**
     * Generate pairings for a round
     * @param {Array} participants - All participants
     * @param {number} currentRound - Current round number
     * @param {Array} previousResults - Previous match results
     * @returns {Object} Pairing result
     */
    generatePairings(participants, currentRound, previousResults = []) {
        // Filter to paid participants only (defensive check)
        const paidParticipants = participants.filter(p => p.paid === true);
        
        if (paidParticipants.length < 2) {
            throw new Error('At least 2 paid participants required');
        }

        // Special cases for small tournaments
        if (paidParticipants.length === 2) {
            return this.generateDirectMatch(paidParticipants, currentRound);
        }

        if (paidParticipants.length === 3) {
            return this.generateRoundRobin(paidParticipants, currentRound, previousResults);
        }

        // Standard Swiss pairing
        const standings = this.calculateStandings(paidParticipants, previousResults);
        const groups = this.groupByRecord(standings);
        const pairings = this.createPairings(groups, currentRound, previousResults);
        const { pairings: finalPairings, byes } = this.handleOddNumbers(pairings, standings, previousResults);

        return {
            round: currentRound,
            matches: finalPairings,
            byes,
            standings,
            totalParticipants: participants.length,
            paidParticipants: paidParticipants.length
        };
    }

    /**
     * Generate direct match for 2 players
     * @param {Array} participants - 2 participants
     * @param {number} currentRound - Round number
     * @returns {Object} Direct match result
     */
    generateDirectMatch(participants, currentRound) {
        const [player1, player2] = participants;
        return {
            round: currentRound,
            matches: [{
                player1: player1.userId || player1.id,
                player2: player2.userId || player2.id,
                player1Name: player1.name || player1.userName,
                player2Name: player2.name || player2.userName
            }],
            byes: [],
            standings: this.calculateStandings(participants, []),
            totalParticipants: 2,
            paidParticipants: 2
        };
    }

    /**
     * Generate round-robin style for 3 players
     * @param {Array} participants - 3 participants
     * @param {number} currentRound - Round number
     * @param {Array} previousResults - Previous match results
     * @returns {Object} Round-robin result
     */
    generateRoundRobin(participants, currentRound, previousResults) {
        const standings = this.calculateStandings(participants, previousResults);
        const pairings = [];
        const byes = [];

        // For 3 players, rotate who gets the bye
        const byeIndex = (currentRound - 1) % 3;
        const players = [...participants];

        if (currentRound <= 3) {
            // Create one pairing and one bye
            const [player1, player2] = players.filter((_, index) => index !== byeIndex);
            pairings.push({
                player1: player1.userId || player1.id,
                player2: player2.userId || player2.id,
                player1Name: player1.name || player1.userName,
                player2Name: player2.name || player2.userName
            });
            byes.push(players[byeIndex].userId || players[byeIndex].id);
        }

        return {
            round: currentRound,
            matches: pairings,
            byes,
            standings,
            totalParticipants: 3,
            paidParticipants: 3
        };
    }
}

// Export to global scope
window.SwissMatchmaker = SwissMatchmaker;





