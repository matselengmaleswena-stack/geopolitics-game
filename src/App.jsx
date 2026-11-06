import { useState, useEffect, useRef } from 'react'
import './App.css'

import Auth from './Auth'
import { auth } from './firebase'
import { onAuthStateChanged, signOut } from 'firebase/auth'

import {
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore'

import { db } from './firebase'

// Starter country data.
// Population figures are approximate, in millions.
const countries = [
  { name: 'South Africa', population: 64 },
  { name: 'India', population: 1450 },
  { name: 'China', population: 1410 },
  { name: 'United States', population: 345 },
  { name: 'Brazil', population: 212 },
  { name: 'Russia', population: 144 },
  { name: 'Mexico', population: 130 },
  { name: 'United Kingdom', population: 69 },
  { name: 'Italy', population: 59 },
  { name: 'Australia', population: 27 }
]

// Calculate the total of soldiers using the population brackets.
function getSoldiers(population) {
  if (population <= 5) return 1
  if (population <= 10) return 2
  if (population <= 25) return 3
  if (population <= 50) return 4
  if (population <= 75) return 5
  if (population <= 100) return 6
  if (population <= 125) return 7
  if (population <= 150) return 8
  return 9
}

// Randomise the order of the players
function shuffleArray(array) {
  const shuffled = [...array]

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))

    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  return shuffled 
}

// Allow an NPC to evaluate the countries on board.
function chooseNpcAction(playerId, gameCountries) {

  // Find all countries controlled by this NPC.
  const ownedCountries = gameCountries.filter(
    (country) => country.owner === playerId
  )

  // Find countries controlled by other players.
  const opponentCountries = gameCountries.filter(
    (country) => country.owner !== playerId
  )

  // Check whether the NPC has any countries.
  if (ownedCountries.length === 0) {
    return {
      type: 'skip',
      message: `An NPC has been eliminated and cannot take a turn.`
    }
  }

  // Check whether there are any opponents left.
  if (opponentCountries.length === 0) {
    return {
      type: 'skip',
      message: `The NPC has no opponents left to attack.`
    }
  }

  // Find countries with enough soldiers to launch an attack.
  const attackOrigins = ownedCountries.filter(
    (country) => country.soldiers >= 2
  )

  // If the NPC cannot attack, it skips its turn.
  if (attackOrigins.length === 0) {
    return {
      type: 'skip',
      message: `The NPC has insufficient soldiers to attack.`
    }
  }

  // Choose the strongest country as the attcaking country.
  const strongestCountry = [...attackOrigins].sort(
    (a, b) => b.soldiers - a.soldiers
  )[0]

  // Choose the opponents with the fewest soldiers.
  const weakestOpponent = [...opponentCountries].sort(
    (a, b) => a.soldiers - b.soldiers
  )[0]

  // Calculate how many soldiers can attcak while leaving one behind.
  const availableAttackers = strongestCountry.soldiers - 1

  // Return the NPC's strategic decision.
  return {
    type:'attack',
    origin: strongestCountry.name,
    target: weakestOpponent.name,
    message: `NPC ${playerId} evaluates its options and chooses to attack ${weakestOpponent.name} from ${strongestCountry.name}. It has ${availableAttackers} available attacking soldiers and identifies the opponent as the weakest target.`
  }
}

// Generate random dice rolls between 1 adn 6.
function rollDice(numberOfDice) {
  return Array.from(
    { length: numberOfDice },
    () => Math.floor(Math.random() * 6) + 1
  ).sort((a, b) => b - a)
}

// Resolve one round of dice comparisons.
function resolveBattleRound(availableAttackers, defendingSoldiers) {

  // Determine how many dice each side can roll.
  const diceCount = Math.min(
    availableAttackers,
    defendingSoldiers
  )

  // Generate the dice rolls.
  const attackerRolls = rollDice(diceCount)
  const defenderRolls = rollDice(diceCount)

  // Keep track of soldier losses.
  let attackerLosses = 0
  let defenderLosses = 0

  // Compare each pair of dice.
  for (let i = 0; i < diceCount; i++) {

    if (attackerRolls[i] > defenderRolls[i]) {
      defenderLosses++
    } else if (defenderRolls[i] > attackerRolls[i]) {
      attackerLosses++
    }

  }

  // Return the results of the battle round.
  return {
    attackerRolls,
    defenderRolls,
    attackerLosses,
    defenderLosses,
  }
}

//Resolve a complete attack between two countries.
function resolveAttack(gameCountries, originName, targetName, attackerId) {

  // Find the attacking and defending countries.
  const origin = gameCountries.find(
    (country) => country.name === originName
  )

  const target = gameCountries.find(
    (country) => country.name === targetName
  )

  // Check that both countries exist.
  if (!origin || !target) {
    return {
      success: false,
      countries: gameCountries,
      log: ['The attack could not be started because a country was not found.']
    }
  }

  // Check that the attacker owns the attacking country.
  if (origin.owner !== attackerId || target.owner === attackerId) {
    return {
      success: false,
      countries: gameCountries,
      log: ['The attack is not valid.']
    }
  }

  // The attacker must leave one soldier behind.
  if (origin.soldiers < 2 || target.soldiers < 1) {
    return {
      success: false,
      countries: gameCountries,
      log: ['There are insufficient soldiers to begin the attack.']
    }
  }

  // Store the original number of defending soldiers.
  const originalDefenders = target.soldiers

  // Keep track of the battel information.
  let attackingSoldiers = origin.soldiers
  let defendingSoldiers = target.soldiers

  const battleLog = []

  battleLog.push(
    `${origin.name} launches an attack on ${target.name}.`
  )

  // Continue fighting while both sides have soldiers.
  while (attackingSoldiers > 1 && defendingSoldiers > 0) {

    // Calculate the number of attacking soldiers available.
    const availableAttackers = attackingSoldiers - 1

    // Resolve one round of dice comparisons.
    const result = resolveBattleRound(
      availableAttackers,
      defendingSoldiers
    )

    // Deduct the soldiers lost by each side.
    attackingSoldiers -= result.attackerLosses
    defendingSoldiers -= result.defenderLosses

    // Record the dice rolls and losses.
    battleLog.push(
      `Dice rolls: ${result.attackerRolls.join(', ')} against ${result.defenderRolls.join(', ')}.`
    )

    battleLog.push(
      `Attacker losses: ${result.attackerLosses}. Defender losses: ${result.defenderLosses}.`
    )

  }

  // Determine whether the attacker conquered the country.
  const conquered = defendingSoldiers === 0

  // Calculate the conquest reinforcement bonus.
  const reinforcementBonus = conquered
  ? Math.max(2, Math.floor(originalDefenders / 2))
  : 0

  // Create updated country information.
  const updatedCountries = gameCountries.map((country) => {

    // Update the attacking country.
    if (country.name === originName) {
      return {
        ...country,
        soldiers: attackingSoldiers
      }
    }

    // Update the defending country.
    if (country.name === targetName) {

      if (conquered) {
        return {
          ...country,
          owner: attackerId,
          soldiers: reinforcementBonus
        }
      }

      return {
        ...country,
        soldiers: defendingSoldiers
      }
    }

    return country
  })

  // Record the final outcome.
  if (conquered) {
    battleLog.push(
      `${origin.name} has conquered ${target.name}!`
    )

    battleLog.push(
      `${target.name} is awarded ${reinforcementBonus} conquest reinforcement soldiers.`
    )
  } else {
    battleLog.push(
      `${origin.name} failed to conquer ${target.name}. The defending country survives.`
    )
  }

  // Return the updated board and battle information.
  return {
    success: true,
    conquered,
    countries: updatedCountries,
    reinforcementBonus,
    remainingAttackers: attackingSoldiers,
    remainingDefenders: defendingSoldiers,
    log: battleLog
  }
}

function App() {

  // Firebase authentication state.
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Firebase campaign loading status.
  const [campaignLoading, setCampaignLoading] = useState(true)
  const [campaignLoaded, setCampaignLoaded] = useState(false)

  // Check whether a player is signed in.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setAuthLoading(false)
    })

    return unsubscribe
  }, [])

  // Control which page the player is viewing.
  const [currentPage, setCurrentPage] = useState('home')


  const [showSetup, setShowSetup] = useState(false)
  const [selectedCountry, setSelectedCountry] = useState('')
  const [gameCountries, setGameCountries] = useState([])

  // Store the players participating in the game.
  const [players, setPlayers] = useState([])

  // Store the randomly generated turn order.
  const [turnOrder, setTurnOrder] = useState([])

  // Track whose turn it is.
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0)

  // Track the current game round.
  const [round, setRound] = useState(1)

  // Control the speed of NPC turns.
  const [fastForward, setFastForward] = useState(false)

  // Store the reinforcements available for the human player to allocate.
  const [reinforcementsToAllocate, setReinforcementsToAllocate] = useState(0)

  // Store the country selected to receive reinforcements.
  const [selectedReinforcementCountry, setSelectedReinforcementCountry] = useState('')

  // Remember which player's turn has received reinforcements.
  const processedReinforcements = useRef(null)

  // Store the decisions and activities of NPC players.
  const [gameLog, setGameLog] = useState([])

  //Store the human player's selected attacking and defending countries.
  const [selectedAttackOrigin, setSelectedAttackOrigin] = useState('')
  const [selectedAttackTarget, setSelectedAttackTarget] = useState('')

  // Store the current battle information.
  const [activeBattle, setActiveBattle] = useState(null)

  // Store the number of soldiers remaining on each side.
  const [attackingSoldiers, setAttackingSoldiers] = useState(0)
  const [defendingSoldiers, setDefendingSoldiers] = useState(0)

  // Store the original number of defending soldiers.
  const [originalDefenders, setOriginalDefenders] = useState(0)

  // Store the results of the most recent dice round.
  const [lastBattleRound, setLastBattleRound] = useState(null)

  // Store a conquered country wgile the player chooses a soldier transfer.
  const [pendingConquest, setPendingConquest] = useState(null)

  //Store how many surviving soldiers the player wants to transfer.
  const [transferAmount, setTransferAmount] = useState(0)

  // Store the countries and soldier amount for a normal country transfer.
  const [transferSource, setTransferSource] = useState('')
  const [transferDestination, setTransferDestination] = useState('')
  const [countryTransferAmount, setCountryTransferAmount] = useState(1)

  // Load the player's saved campaign from Firestore.
  useEffect(() => {

    async function loadCampaign() {

      if (!user) {
        setCampaignLoading(false)
        setCampaignLoaded(false)
        return
      }

      setCampaignLoading(true)
      setCampaignLoaded(false)

      try {

        // Identify this player's saved campaign.
        const campaignRef = doc(
          db,
          'users',
          user.uid,
          'games',
          'currentCampaign'
        )

        // Retrieve the saved campaign.
        const campaignSnapshot = await getDoc(campaignRef)

        // Restore the campaign if a saved game exists.
        if (campaignSnapshot.exists()) {

          const savedCampaign = campaignSnapshot.data()

          setSelectedCountry(savedCampaign.selectedCountry ?? '')
          setGameCountries(savedCampaign.gameCountries ?? [])
          setPlayers(savedCampaign.players ?? [])
          setTurnOrder(savedCampaign.turnOrder ?? [])
          setCurrentTurnIndex(savedCampaign.currentTurnIndex ?? 0)
          setRound(savedCampaign.round ?? 1)
          setFastForward(savedCampaign.fastForward ?? false)

          setReinforcementsToAllocate(
            savedCampaign.reinforcementsToAllocate ?? 0
          )

          setSelectedReinforcementCountry(
            savedCampaign.selectedReinforcementCountry ?? ''
          )

          setGameLog(savedCampaign.gameLog ?? [])

          setSelectedAttackOrigin(
            savedCampaign.selectedAttackOrigin ?? ''
          )

          setSelectedAttackTarget(
            savedCampaign.selectedAttackTarget ?? ''
          )

          setActiveBattle(savedCampaign.activeBattle ?? null)
          setAttackingSoldiers(savedCampaign.attackingSoldiers ?? 0)
          setDefendingSoldiers(savedCampaign.defendingSoldiers ?? 0)
          setOriginalDefenders(savedCampaign.originalDefenders ?? 0)
          setLastBattleRound(savedCampaign.lastBattleRound ?? null)
          setPendingConquest(savedCampaign.pendingConquest ?? null)
          setTransferAmount(savedCampaign.transferAmount ?? 0)

          setTransferSource(savedCampaign.transferSource ?? '')
          setTransferDestination(savedCampaign.transferDestination ?? '')

          setCountryTransferAmount(
            savedCampaign.countryTransferAmount ?? 1
          )

          setShowSetup(savedCampaign.showSetup ?? false)

          // Restore the reinforcement tracking information.
          processedReinforcements.current = 
            savedCampaign.processedReinforcements ?? null

        }

        console.log('Campaign loading completed.')

      } catch (error) {

        console.error('Error loading campaign:', error)

      } finally {

        setCampaignLoading(false)
        setCampaignLoaded(true)
      }
    }

    loadCampaign()

    }, [user])

    // Automatically save the player's campaign to Firestore.
    useEffect(() => {
      async function saveCampaign() {
        // Do not save until a user is signed in and loading is complete.
        if (!user || !campaignLoaded || campaignLoading) {
          return
        }

        try {
          const campaignRef = doc(
            db,
            'users',
            user.uid,
            'games',
            'currentCampaign'
          )

          await setDoc(campaignRef, {
            selectedCountry,
            gameCountries,
            players,
            turnOrder,
            currentTurnIndex,
            round,
            fastForward,
            reinforcementsToAllocate,
            selectedReinforcementCountry,
            processedReinforcements: processedReinforcements.current,
            gameLog,
            selectedAttackOrigin,
            selectedAttackTarget,
            activeBattle,
            attackingSoldiers,
            defendingSoldiers,
            originalDefenders,
            lastBattleRound,
            pendingConquest,
            transferAmount,
            transferSource,
            transferDestination,
            countryTransferAmount,
            showSetup,
            updatedAt: new Date()
          }, { merge: true})

          console.log('Campaign saved successfully.')
        } catch (error) {
          console.error('Error saving campaign:', error)
        }
      }

      saveCampaign()
    }, [
      user,
      campaignLoaded,
      campaignLoading,
      selectedCountry,
      gameCountries,
      players,
      turnOrder,
      currentTurnIndex,
      round,
      fastForward,
      reinforcementsToAllocate,
      selectedReinforcementCountry,
      gameLog,
      selectedAttackOrigin,
      selectedAttackTarget,
      activeBattle,
      attackingSoldiers,
      defendingSoldiers,
      originalDefenders,
      lastBattleRound,
      pendingConquest,
      transferAmount,
      transferSource,
      transferDestination,
      countryTransferAmount,
      showSetup
    ])



  // Count the countries controlled by the human player.
  const humanOwnedCountryCount = gameCountries.filter(
    country => country.owner === 'player'
  ).length

  // Check whether the human player has won or lost.
  const hasWon =
    gameCountries.length > 0 &&
    humanOwnedCountryCount === gameCountries.length

  const hasLost =
    gameCountries.length > 0 &&
    humanOwnedCountryCount === 0

  // Determine whether the campaign has ended.
  const gameOver = hasWon || hasLost

  // Open the country selection screen.
  function openNewGame() {
    setShowSetup(true)
    setGameCountries([])
  }

  // Move the game to the next player's turn.
  function endTurn() {
    if (gameOver) return
    if (currentTurnIndex === turnOrder.length - 1) {
      setCurrentTurnIndex(0)
      setRound((previousRound) => previousRound + 1)
    } else {
      setCurrentTurnIndex((previousIndex) => previousIndex + 1)
    }
  }

  // Calculate the reinforcements a player receives.
  function calculateReinforcements(playerId, countriesOnBoard) {
    const ownedCountries = countriesOnBoard.filter(
      (country) => country.owner === playerId
    )

    return ownedCountries.length * 2
  }

  // Allocate reinforcement soldiers to the selected country.
  function allocateReinforcements() {
    if (!selectedReinforcementCountry || reinforcementsToAllocate <= 0) {
      return
    }

    // Confirm that the selected country belongs to the human player.
    const selectedCountry = gameCountries.find(
      country => country.name === selectedReinforcementCountry
    )

    if (!selectedCountry || selectedCountry.owner !== 'player') {
      return
    }

    // Add the reinforcements to the selected country.
    setGameCountries(previousCountries => 
      previousCountries.map(country =>
        country.name === selectedReinforcementCountry
        ? {
          ...country,
          soldiers: country.soldiers + reinforcementsToAllocate
        }
        : country
      )
    )

    // Record the allocation in the game activity log.
    setGameLog(previousLog => [
      ...previousLog,
      `${reinforcementsToAllocate} reinforcement soldiers allocated to ${selectedReinforcementCountry}.`
    ])

    // Reset the reinforcement allocation controls.
    setReinforcementsToAllocate(0)
    setSelectedReinforcementCountry('')
  }

  // Transfer soldiers between countries already owned by the human player.
  function transferBetweenCountries() {
    
    // Only allow transfers during the human player's turn.
    const currentPlayerId = turnOrder[currentTurnIndex]

    if (currentPlayerId !== 'player') return

    // Prevent transfers during battles or pending conquests.
    if (activeBattle || pendingConquest) return

    // Require reinforcement allocation to be completed first.
    if (reinforcementsToAllocate > 0) return

    // Find the selected source and destination countries.
    const source = gameCountries.find(
      country => country.name === transferSource
    )

    const destination = gameCountries.find(
      country => country.name === transferDestination
    )

    // Make sure both countries belong to the human player.
    if (
      !source ||
      !destination ||
      source.owner !== 'player' ||
      destination.owner !== 'player'
    ) return

    // Prevent transferring soldiers to the same country.
    if (source.name === destination.name) return

    // Check that at least one soldier remains behind.
    const maximumTransfer = source.soldiers - 1

    const soldiersToMove = Number(countryTransferAmount)

    // Validate the number of soldiers being transferred.
    if (
      !Number.isInteger(soldiersToMove) ||
      soldiersToMove < 1 ||
      soldiersToMove > maximumTransfer
    ) return

    // Update the soldier counts in both countries.
    setGameCountries(previousCountries =>
      previousCountries.map(country => {

        if (country.name === transferSource) {
          return {
            ...country,
            soldiers: country.soldiers - soldiersToMove
          }
        }

        if (country.name === transferDestination) {
          return {
            ...country,
            soldiers: country.soldiers + soldiersToMove
          }
        }

        return country
      })
    )

    // Record the transfer in the activity log.
    setGameLog(previousLog => [
      ...previousLog,
      `${soldiersToMove} soldiers transferred from ${transferSource} to ${transferDestination}.`
    ])

    // Reset the transfer controls.
    setTransferSource('')
    setTransferDestination('')
    setCountryTransferAmount(1)
  }

  // Award reinforcements at the beginning of each player's turn.
  useEffect(() => {
    if (gameCountries.length === 0 || turnOrder.length === 0) return

    const currentPlayerId = turnOrder[currentTurnIndex]

    const currentPlayer = players.find(
      player => player.id === currentPlayerId
    )

    if (!currentPlayer) return

    // Identify this particular player's turn.
    const turnKey = `${round}-${currentTurnIndex}-${currentPlayerId}`

    // Prevent reinforcements from being awarded more than once.
    if (processedReinforcements.current === turnKey) return

    processedReinforcements.current = turnKey

    // Nobody receives reinforcements during round 1.
    if (round === 1) {
      setReinforcementsToAllocate(0)
      return
    }

    //Calculate the player's reinforcement allowance.
    const reinforcementCount = calculateReinforcements(
      currentPlayerId,
      gameCountries
    )

    // Award reinforcements to the human player.
    if (currentPlayer.type === 'human') {
      setReinforcementsToAllocate(reinforcementCount)

      setGameLog(previousLog => [
        ...previousLog,
        `You receive ${reinforcementCount} reinforcement soldiers.`
      ])

    } else {

      // Find the countries owned by this NPC.
      const ownedCountries = gameCountries.filter(
        country => country.owner === currentPlayerId
      )

      // An eliminated NPC cannot receive reinforcements.
      if (ownedCountries.length === 0) return

      // Find the NPC's strongest country.
      const strongestCountry = [...ownedCountries].sort(
        (a, b) => b.soldiers - a.soldiers
      )[0]

      // Automatically add all reinforcements to that country.
      setGameCountries(previousCountries => 
        previousCountries.map(country =>
          country.name === strongestCountry.name
          ? {
            ...country,
            soldiers: country.soldiers + reinforcementCount
          }
          : country
        )
      )

      setGameLog(previousLog => [
        ...previousLog,
        `${currentPlayer.name} receives ${reinforcementCount} reinforcement soldiers and add them to ${strongestCountry.name}.`
      ])
    }


  }, [
    round,
    currentTurnIndex,
    turnOrder,
    players,
    gameCountries
  ])

  // Start a battle chosen by the human player.
  function launchHumanAttack() {

    // Prevent attacks before reinforcements are allocated.
    if (reinforcementsToAllocate > 0) {
      return
    }
    if (!selectedAttackOrigin || !selectedAttackTarget) {
      return
    }

    const origin = gameCountries.find(
      country => country.name === selectedAttackOrigin 
    )

    const target = gameCountries.find(
      country => country.name === selectedAttackTarget
    )

    if (!origin || !target) return

    if (origin.soldiers < 2 || target.soldiers < 1) {
      setGameLog(previousLog => [
        ...previousLog,
        'There are insufficient soldiers to begin this attack.'
      ])
      return
    }

    setActiveBattle({
      origin: selectedAttackOrigin,
      target: selectedAttackTarget
    })

    setAttackingSoldiers(origin.soldiers)
    setDefendingSoldiers(target.soldiers)
    setOriginalDefenders(target.soldiers)
    setLastBattleRound(null)

    setGameLog(previousLog => [
      ...previousLog,
      `You launch an attack on ${selectedAttackTarget} from ${selectedAttackOrigin}.`
    ])
  }

  // Resolve one round of the human player's battle.
  function playBattleRound() {
    if (!activeBattle || attackingSoldiers <= 1 || defendingSoldiers <= 0) {
      return
    }

    // Calculate how many attacking soldiers can participate.
    const availableAttackers = attackingSoldiers - 1

    // Roll the dice and compare the results.
    const result = resolveBattleRound(
      availableAttackers,
      defendingSoldiers
    )

    // Calculate the remaining soldiers.
    const remainingAttackers = 
    attackingSoldiers - result.attackerLosses

    const remainingDefenders = 
    defendingSoldiers - result.defenderLosses

    // Save the new soldier counts.
    setAttackingSoldiers(remainingAttackers)
    setDefendingSoldiers(remainingDefenders)

    // Store the latest dice results for display.
    setLastBattleRound(result)

    // Update the country cards immediately.
    const conquered = remainingDefenders === 0
    const attackerDefeated = remainingAttackers === 1

    const reinforcementBonus = conquered
    ? Math.max(2, Math.floor(originalDefenders / 2))
    : 0

    setGameCountries(previousCountries =>
      previousCountries.map(country => {
        if (country.name === activeBattle.origin) {
          return {
            ...country,
            soldiers: remainingAttackers
          }
        }

        if (country.name === activeBattle.target) {
          if (conquered) {
            return {
              ...country,
              owner: 'player',
              soldiers: reinforcementBonus
            }
          }

          return {
            ...country,
            soldiers: remainingDefenders
          }
        }

        return country
      })
    )

    // Record the dice results in the activity log.
    setGameLog(previousLog => [
      ...previousLog,
      `Battle round: ${activeBattle.origin} attacks ${activeBattle.target}.`,
      `Your dice: ${result.attackerRolls.join(', ')}. Defender dice: ${result.defenderRolls.join(', ')}.`,
      `Your losses: ${result.attackerLosses}. Defender losses: ${result.defenderLosses}.`,
      `Remaining soldiers: ${remainingAttackers} attacking and ${remainingDefenders} defending.`
    ])

    // Check whether the battle has ended.
    if (conquered) {
      setGameLog(previousLog => [
        ...previousLog,
        `Victory! You have conquered ${activeBattle.target}.`,
        `${activeBattle.target} receives ${reinforcementBonus} conquest reinforcement soldiers.`,
        `Choose how many surviving soldiers to transfer into your newly conquered country.`
      ])

      // Save the conquest details while the player makes a transfer decision.
      setPendingConquest({
        origin: activeBattle.origin,
        target: activeBattle.target,
        remainingAttackers,
        reinforcementBonus
      })

      setTransferAmount(0)
      setActiveBattle(null)
      setLastBattleRound(null)
      setSelectedAttackOrigin('')
      setSelectedAttackTarget('')

    } else if (attackerDefeated) {
      setGameLog(previousLog => [
        ...previousLog,
        `Your attack has ended. ${activeBattle.target} successfully defended its country.`
      ])

      setActiveBattle(null)
      setLastBattleRound(null)
      setSelectedAttackOrigin('')
      setSelectedAttackTarget('')
      endTurn()
    }
  }

  // Allow the human player to stop an ongoing attack.
  function stopBattle() {
    if (!activeBattle) return

    setGameLog(previousLog => [
      ...previousLog,
      `You stopped your attack on ${activeBattle.target}.`,
      `${attackingSoldiers} soldiers remain in ${activeBattle.origin}.`
    ])

    setActiveBattle(null)
    setLastBattleRound(null)
    setSelectedAttackOrigin('')
    setSelectedAttackTarget('')

    // Finish the human player's turn.
    endTurn()
  }

  // Confirm the number of soldiers transferred after a conquest.
  function confirmConquestTransfer() {
    if (!pendingConquest) return

    // Always leave at least one soldier in the attacking country.
    const maximumTransfer = Math.max(
      0,
      pendingConquest.remainingAttackers - 1
    )

    // Keep the selected amount within the permitted range.
    const soldiersToTransfer = Math.min(
      Math.max(0, Number(transferAmount) || 0),
      maximumTransfer
    )

    // Update both countries' soldier counts.
    setGameCountries(previousCountries => 
      previousCountries.map(country => {
        if (country.name === pendingConquest.origin) {
          return {
            ...country,
            soldiers: pendingConquest.remainingAttackers - soldiersToTransfer
          }
        }

        if (country.name === pendingConquest.target) {
          return {
            ...country,
            soldiers: pendingConquest.reinforcementBonus + soldiersToTransfer
          }
        }
        
        return country
          
      })
    )

    // Record the transfer in the activity log.
    setGameLog(previousLog => [
      ...previousLog,
      `${soldiersToTransfer} soldiers transferred to ${pendingConquest.target}.`,
      `${pendingConquest.origin} retains ${pendingConquest.remainingAttackers - soldiersToTransfer} soldiers.`
    ])

    // Clear the pending decision and finish the turn.
    setPendingConquest(null)
    setTransferAmount(0)
    endTurn()
  }


  // Automatically process NPC turns and their attacks.
  useEffect(() => {
    if (
      gameCountries.length === 0 || 
      turnOrder.length === 0 ||
      gameOver
    ) return

    const currentPlayerId = turnOrder[currentTurnIndex]
    const currentPlayer = players.find(
      player => player.id === currentPlayerId
    )

    if (!currentPlayer || currentPlayer.type !== 'npc') return

    const timer = setTimeout(() => {
      const decision = chooseNpcAction(currentPlayerId, gameCountries)

      if (decision.type === 'attack') {
        const result = resolveAttack(
          gameCountries,
          decision.origin,
          decision.target,
          currentPlayerId
        )

        setGameCountries(result.countries)

        setGameLog(previousLog => [
          ...previousLog,
          decision.message,
          ...result.log
        ])
      } else {
        setGameLog(previousLog => [
          ...previousLog,
          decision.message
        ])
      }

      if (currentTurnIndex === turnOrder.length - 1) {
        setCurrentTurnIndex(0)
        setRound(previousRound => previousRound + 1)
      } else {
        setCurrentTurnIndex(previousIndex => previousIndex + 1)
      }
    }, fastForward ? 700 : 3000)

    return () => clearTimeout(timer)
  }, [
      currentTurnIndex, 
      turnOrder, 
      players, 
      gameCountries, 
      gameOver,
      fastForward
    ])

  // Start a campaign with one human player and nine NPCs.
  function startCampaign() {
    if (!selectedCountry) return

    // Reset the reinforcement tracker for a new campaign.
    processedReinforcements.current = null

    // Select nine random opponents.
    const opponents = countries.filter(
      (country) => country.name !== selectedCountry
    )

    const shuffledOpponents = shuffleArray(opponents)
    const chosenOpponents = shuffledOpponents.slice(0, 9)

    // Find the country selected by the human player.
    const playerCountry = countries.find(
      (country) => country.name === selectedCountry
    )

    // Create the human player.
    const humanPlayer = {
      id: 'player',
      name: 'You',
      type: 'human'
    }

    // Create nine individual NPC players.
    const npcPlayers = chosenOpponents.map((country) => ({
      id: `npc-${country.name}`,
      name: country.name,
      type: 'npc'
    }))

    // Combine all ten players.
    const campaignPlayers = [humanPlayer, ...npcPlayers]

    // Assign each country to its original player.
    const campaignCountries = [
      playerCountry,
      ...chosenOpponents
    ].map((country) => ({
      ...country,
      soldiers: getSoldiers(country.population),
      owner: country.name === selectedCountry
      ? 'player'
      : `npc-${country.name}`
    }))

    // Randomise the order in which players take turns.
    const randomizedTurnOrder = shuffleArray(
      campaignPlayers.map((player) => player.id)
    )

    // Save the campaign information.
    setPlayers(campaignPlayers)
    setGameCountries(campaignCountries)
    setTurnOrder(randomizedTurnOrder)

    // Start at the first position in the turn order.
    setCurrentTurnIndex(0)

    // Every new campaign starts at round one.
    setRound(1)
    setGameLog([])

    setShowSetup(false)

  }

  // Show a loading a message while Firebase checks authentication.
  if (authLoading) {
    return (
      <main className="game">
        <p>Checking your sign-in...</p>
      </main>
    )
  }

  // Show the login page if nobody is signed-in.
  if (!user) {
    return <Auth/>
  }

  // Show a loading message while Firebase retrieves the saved campaign.
  if (campaignLoading) {
    return (
      <main className="game">
        <p>Loading your campaign...</p>
      </main>
    )
  }

  return (
    <main className="game">
      <nav className="navbar">
        <a className="brand" href="#home">
          <span className="brand-icon">G</span>
          <span>Geopolitics</span>
        </a>

        <div className="nav-links">
          <button
            type="button"
            className={currentPage === 'home' ? 'active' : ''}
            onClick={() => setCurrentPage('home')}
            >
              Home
            </button>

            <button
              type="button"
              className={currentPage === 'rules' ? 'active' : ''}
              onClick={() => setCurrentPage('rules')}
              >
                Game Rules
              </button>

            <button
              type="button"
              className={currentPage === 'about' ? 'active' : ''}
              onClick={() => setCurrentPage('about')}
              >
                About
              </button>

          <span>{user.email}</span>

          <button
            type="button"
            onClick={() => signOut(auth)}
            >
              Sign Out
            </button>
        </div>
      </nav>

      {currentPage === 'home' && (
        <>
        

      <header className="game-header" id="home">
        <p className="eyebrow">A WORLD CONQUEST STRATEGY GAME</p>
        <h1>Geopolitics</h1>
        <p className="intro">
          Build your strategy, command your soldiers, and compete to conquer the world.
        </p>
      </header>

      {!showSetup && (
        <section className="game-panel">
          <h2>Your campaign begins here</h2>

          <p>
            Choose your country and prepare to compete against strategic opponents.
          </p>

          <button type="button" onClick={openNewGame}>
            New Game
          </button>
        </section>
      )}

      {showSetup && gameCountries.length === 0 && (
        <section className="game-panel">
          <h2>Choose your country</h2>

          <p>
            Select the country you want to lead. Your starting soldiers depend on its population.
          </p>

          <label htmlFor="country-select">Select your country</label>

          <select
            id="country-select"
            value={selectedCountry}
            onChange={(event) => setSelectedCountry(event.target.value)}
          >
            <option value="">--Choose a country--</option>
            {countries.map((country) => (
              <option key={country.name} value={country.name}>
                {country.name}
              </option>
            ))}
          </select>

          {selectedCountry && (
            <div className="country-preview">
              <h3>{selectedCountry}</h3>

              <p>
                <strong>Population:</strong>{' '}
                {countries.find((country) => country.name === selectedCountry).population.toLocaleString()} million
              </p>

              <p>
                <strong>Starting soldiers:</strong>{' '}
                {getSoldiers(countries.find((country) => country.name === selectedCountry).population)}
              </p>
            </div>
          )}

          <button type="button" onClick={startCampaign} disabled={!selectedCountry}>
            Start Campaign
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() => setShowSetup(false)}
          >
            Back
          </button>
        </section>
      )}

      {gameCountries.length > 0 && (
        <section className="game-panel">
          <h2>Your Campaign</h2>

          {hasWon && (
            <div className="game-result">
              <h3>Victory!</h3>
              <p>
                Congratulations! You have conquered every country
                and achieved global domination.
              </p>
            </div>
          )}

          {hasLost && (
            <div className="game-result">
              <h3>Game Over!</h3>
              <p>
                Your country has been conquered. You have lost
                control of the world.
              </p>
            </div>
          )}

          <div className="turn-info">
            <p>
              <strong>Round:</strong> {round}
            </p>

            <p>
              <strong>Current turn:</strong>{' '}
              {players.find(
                (player) => player.id === turnOrder[currentTurnIndex]
              )?.name}
            </p>

            <p>
              <strong>Turn order:</strong>{' '}
              {turnOrder.map((playerId) => 
              players.find ((player) => player.id === playerId)?.name
              ).join(' → ')}
            </p>
          </div>

          <div className="fast-forward-controls">
            <h3>Game Speed</h3>

            <p>
              {fastForward
                ? 'Fast-Forward is enabled.'
                : 'Normal game speed is enabled.'}
            </p>

            <button
              type="button"
              onClick={() => setFastForward(previous => !previous)}
              >
                {fastForward
                  ? 'Disable Fast-Forward'
                  : 'Enable Fast-Forward'}
              </button>
          </div>

          {/* Human player reinforcement controls */}
          {players.find(
            player => player.id === turnOrder[currentTurnIndex]
          )?.type === 'human' && (
            <div className="reinforcement-panel">
              <h3>Reinforcements</h3>

              {round === 1 ? (
                <p>Reinforcements become available from Round 2.</p>
              ) : (
                <p>
                  Soldiers available to allocate: {reinforcementsToAllocate}
                </p>
              )}

              {reinforcementsToAllocate > 0 && (
                <>
                  <label htmlFor="reinforcement-country">
                    Choose a country to receive your soldiers
                  </label>
                  
                  <select
                    id="reinforcement-country"
                    value={selectedReinforcementCountry}
                    onChange={(event) =>
                      setSelectedReinforcementCountry(event.target.value)
                    }
                    >
                      <option value="">--Choose your country--</option>

                      {gameCountries
                        .filter(country => country.owner === 'player')
                        .map(country => (
                          <option key={country.name} value={country.name}>
                            {country.name} ({country.soldiers} soldiers)
                          </option>
                        ))}
                    </select>

                    <button
                      type="button"
                      onClick={allocateReinforcements}
                      disabled={!selectedReinforcementCountry}
                      >
                        Allocate Reinforcements
                      </button>
                    </>
              )}

              {round >= 2 && reinforcementsToAllocate === 0 && (
                <p>All available reinforcements have been allocated.</p>
              )}
            </div>
          )}

          <p>
            Your world contains 10 countries. Conquer all of them to win!
          </p>

          {/* Human player attack controls */}
          {players.find(
            (player) => player.id === 'player'
          )?.id === turnOrder[currentTurnIndex] && (
            <div className="attack-controls">
              <h3>Launch an Attack</h3>

              <p>Select one of your countries and an opponent to attack.</p>

              <label htmlFor="attack-origin">Attacking country</label>

              <select
                id="attack-origin"
                value={selectedAttackOrigin}
                disabled={reinforcementsToAllocate > 0}
                onChange={(event) => {
                  setSelectedAttackOrigin(event.target.value)
                }}
                >
                  <option value="">--Choose your country --</option>

                  {gameCountries
                    .filter(
                      (country) => 
                        country.owner === 'player' && country.soldiers >= 2
                    )
                    .map((country) => (
                      <option key={country.name} value={country.name}>
                        {country.name} ({country.soldiers} soldiers)
                      </option>
                    ))}
                </select>

                <label htmlFor="attack-target">Target country</label>

                <select
                  id="attack-target"
                  value={selectedAttackTarget}
                  disabled={reinforcementsToAllocate > 0}
                  onChange={(event) => {
                    setSelectedAttackTarget(event.target.value)
                  }}
                  >
                    <option value="">-- Choose an Opponent --</option>

                    {gameCountries
                      .filter(
                        (country) => country.owner !== 'player'
                      )
                      .map((country) => (
                        <option key={country.name} value={country.name}>
                          {country.name} ({country.soldiers} soldiers)
                        </option>
                      ))}
                  </select>

                  <button
                    type="button"
                    onClick={launchHumanAttack}
                    disabled={
                      !selectedAttackOrigin ||
                      !selectedAttackTarget ||
                      !!activeBattle ||
                      reinforcementsToAllocate > 0
                    }
                    >
                      Launch Attack
                    </button>
            </div>
          )}

          {/* Transfer soldiers between countries already owned */}
          {players.find(
            player => player.id === turnOrder[currentTurnIndex]
          )?.type === 'human' && (
            <div className="transfer-panel">
              <h3>Transfer Soldiers</h3>

              <p>
                Move soldiers between countries you already control.
                You must leave at least one soldier behind.
              </p>

              <label htmlFor="transfer-source">
                Country sending soldiers
              </label>

              <select
                id="transfer-source"
                value={transferSource}
                disabled={
                  reinforcementsToAllocate > 0 ||
                  !!activeBattle ||
                  !!pendingConquest
                }
                onChange={event => {
                  setTransferSource(event.target.value)
                }}
                >
                  <option value="">-- Choose source country --</option>

                  {gameCountries
                    .filter(
                      country =>
                        country.owner === 'player' &&
                        country.soldiers >=2
                    )
                    .map(country => (
                      <option key={country.name} value={country.name}>
                        {country.name} ({country.soldiers} soldiers)
                      </option>
                    ))}
                </select>

                <label htmlFor="transfer-destination">
                  Country receiving soldiers
                </label>

                <select
                  id="transfer-destination"
                  value={transferDestination}
                  disabled={
                    !transferSource ||
                    reinforcementsToAllocate > 0 ||
                    !!activeBattle ||
                    !!pendingConquest
                  }
                  onChange={event => {
                    setTransferDestination(event.target.value)
                  }}
                  >

                    <option value="">-- Choose destination country --</option>

                    {gameCountries
                      .filter(
                        country => 
                          country.owner === 'player' &&
                          country.name !== transferSource
                      )
                      .map(country => (
                        <option key={country.name} value={country.name}>
                          {country.name} ({country.soldiers} soldiers)
                        </option>
                      ))}
                </select>

                <label htmlFor="country-transfer-amount">
                  Number of soldiers to transfer
                </label>

                <input
                  id="country-transfer-amount"
                  type="number"
                  min="1"
                  max={
                    gameCountries.find(
                      country => country.name === transferSource
                    )?.soldiers - 1 || 1
                  }
                  value={countryTransferAmount}
                  disabled={!transferSource || !!activeBattle || !!pendingConquest}
                  onChange={event => 
                    setCountryTransferAmount(Number(event.target.value))
                  }
                  />

                  <button
                    type="button"
                    onClick={transferBetweenCountries}
                    disabled={
                      !transferSource ||
                      !transferDestination ||
                      !Number.isInteger(countryTransferAmount) ||
                      countryTransferAmount < 1 ||
                      countryTransferAmount >
                        (gameCountries.find (
                          country => country.name === transferSource
                        )?.soldiers - 1 || 0) ||
                        !!activeBattle ||
                        !!pendingConquest
                    }
                    >
                      Confirm Soldier Transfer
                    </button>

                </div>
          )}

          {/* Display the active battle and its controls */}
          {activeBattle && (
            <div className="battle-panel">
              <h3>Battle in Progress</h3>

              <p>
                <strong>Attacking country:</strong> {activeBattle.origin}
              </p>

              <p>
                <strong>Defending country:</strong> {activeBattle.target}
              </p>

              <p>
                <strong>Your remaining soldiers:</strong> {attackingSoldiers}
              </p>

              <p>
                <strong>Defending Soldiers:</strong> {defendingSoldiers}
              </p>

              {lastBattleRound && (
                <div className="dice-results">
                  <h4>Latest Dice Round</h4>

                  <p>
                    <strong>Your dice:</strong>{' '}
                    {lastBattleRound.attackerRolls.join(', ')}
                  </p>

                  <p>
                    <strong>Defender dice:</strong>{' '}
                    {lastBattleRound.defenderRolls.join(', ')}
                  </p>

                  <p>
                    <strong>Your losses:</strong>{' '}
                    {lastBattleRound.attackerLosses}
                  </p>

                  <p>
                    <strong>Defender losses:</strong>{' '}
                    {lastBattleRound.defenderLosses}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={playBattleRound}
                disabled={attackingSoldiers <= 1 || defendingSoldiers <= 0}
                >
                  Continue Attack - Roll Dice
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={stopBattle} 
                >
                  Stop Attack
                </button>
            </div>
          )}

          {/* Allow the player to choose soldiers after conquering a country */}
          {pendingConquest && (
            <div className="battle-panel">
              <h3>Country Conquered!</h3>

              <p>
                You have conquered <strong>{pendingConquest.target}</strong>.
              </p>

              <p>
                Conquest reinforcement bonus: {pendingConquest.reinforcementBonus} soldiers
              </p>

              <p>
                Soldiers available to transfer: {Math.max(0, pendingConquest.remainingAttackers - 1)}
              </p>

              <label htmlFor="transfer-amount">
                How many soldiers would you like to transfer?
              </label> 

              <input
                id="transfer-amount"
                type="number"
                min="0"
                max={Math.max(0, pendingConquest.remainingAttackers - 1)}
                value={transferAmount}
                onChange={(event) => setTransferAmount(Number(event.target.value))}
              />

              <button
                type="button"
                onClick={confirmConquestTransfer}
                >
                  Confirm Soldier Transfer
              </button>
            </div>
          )}

         <div className="game-log">
          <h3>Game Activity</h3>

          <div className="game-log-content">
            {gameLog.length === 0 ? (
              <p className="log-empty">No NPC activity yet.</p>
            ) : (
              gameLog.map((activity, index) => (
                <p className="log-entry" key={index}>
                  {activity}
                </p>
              ))
            )}
          </div>
         </div>
         
          <div className="country-grid">
            {gameCountries.map((country) => (
              <article className="country-card" key={country.name}>
                <h3>{country.name}</h3>

                <p>
                  <strong>Population:</strong> {country.population} million
                </p>

                <p>
                  <strong>Soldiers:</strong> {country.soldiers}
                </p>

                <span className="country-owner">
                  {players.find((player) => player.id === country.owner)?.name}
                </span>
              </article>
            ))}
          </div>

          {players.find(
            player => player.id === turnOrder[currentTurnIndex]
          )?.type === 'human' && !activeBattle && (
            <button
              type="button"
              onClick={endTurn}
              disabled={reinforcementsToAllocate > 0 || !!pendingConquest}
              >
                End Turn
              </button>
          )}

          <button
            type="button"
            onClick={() => {
              setGameCountries([])
              setSelectedCountry('')
              setShowSetup(true)
            }}
          >
            Start a New Campaign
          </button>
        </section>
      )}

      <footer className="game-footer" id="about">
        <div className="footer-content">
          <div>
            <h2>GEOPOLITICS</h2>
            <p>Strategy. Diplomacy. Conquest.</p>
          </div>

          <p className="footer-description">
            Command your nation. Make strategic decisions. Compete for global domination.
          </p>
        </div>

        <div className="footer-bottom">
          <p>© 2026 Geopolitics Game</p>
          <p>Academic project</p>
        </div>
      </footer>

      </>
      )}

      {currentPage === 'rules' && (
        <section className="game-panel">
          <h2>Game Rules</h2>

          <p>
            Welcome to Geopolitics! Your objective is to conquer all
            ten countries and achieve global domination.
          </p>

          <h3>1. Starting the Game</h3>
          <p>
            Choose one of the ten available countries. Your starting
            soldiers are determined by your country's population.
          </p>

          <h3>2. Turn Order</h3>
          <p>
            Turn order is randomised at the beginning of each campaign.
            Each player gets one opportunity to attack or skip their turn.
          </p>

          <h3>3. Battles</h3>
          <p>
            Battles are decided using dice rolls. The results determine
            which side loses soldiers. Tied dice results cause no losses.
          </p>

          <h3>4. Conquering Countries</h3>
          <p>
            When you conquer a country, you receive a conquest bonus.
            You must then choose how many soldiers to transfer into
            the conquered country.
          </p>

          <h3>5. Reinforcements</h3>
          <p>
            Starting from Round 2, players receive reinforcements based
            on the number of countries they control.
          </p>

          <h3>6. Winning and Losing</h3>
          <p>
            You win by conquering all ten countries. You lose if
            you no longer control any countries.
          </p>

          <button
            type="button"
            onClick={() => setCurrentPage('home')}
            >
              Back to Home
            </button>
        </section>
      )}

      {currentPage === 'about' && (
        <section className="game-panel">
          <h2>About Geopolitics</h2>

          <p>
            Geopolitics is a strategy-based country conquest game
            developed as an academic project.
          </p>

          <h3>Our Objective</h3>
          <p>
            The game challenges players to make strategic decisions,
            manage military resources and expand their territory
            while competing against nine computer-controlled opponents.
          </p>

          <h3>Gameplay Experience</h3>
          <p>
            Players experience turn-based gameplay involving
            country selection, randomised turn order, dice-based
            battles, reinforcements and territorial expansion.
          </p>

          <h3>Academic Project</h3>
          <p>
            This application demonstartes the use of software
            development, programming logic, data management and
            interactive user interface design.
          </p>

          <button
            type="button"
            onClick={() => setCurrentPage('home')}
            >
              Back to Home
            </button>
        </section>
      )}
    </main>
    
  )
}

export default App
          