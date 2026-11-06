import { useState } from 'react'
import { auth, db } from './firebase'
import './Auth.css'

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword
} from 'firebase/auth'

import {
    doc,
    setDoc,
    serverTimestamp
} from 'firebase/firestore'

function Auth() {
    const [isRegistering, setIsRegistering] = useState(false)
    const [displayName, setDisplayName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    async function handleSubmit(event) {
        event.preventDefault()

        setError('')
        setLoading(true)

        try {
            if (isRegistering) {

                // Create a new player account.
                const result = await createUserWithEmailAndPassword(
                    auth,
                    email,
                    password
                )

                // Save the player's profile in Firestore.
                await setDoc(doc(db, 'users', result.user.uid), {
                    displayName: displayName.trim(),
                    email: result.user.email,
                    createdAt: serverTimestamp()
                })

            } else {

                // Sign in an existing player.
                await signInWithEmailAndPassword(
                    auth,
                    email,
                    password
                )
            }
        } catch (error) {
            setError(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <main className="auth-page">
            <section className="auth-card">

                <p className="eyebrow">
                    A WORLD CONQUEST STRATEGY GAME
                </p>

                <h1>GEOPOLITICS</h1>

                <h2>
                    {isRegistering
                        ? 'Create Your Account'
                        : 'Welcome Back'}
                </h2>

                <p>
                    {isRegistering
                        ? 'Join the world of strategy and competition.'
                        : 'Sign in to access your campaign.'}
                </p>

                <form onSubmit={handleSubmit}>

                    {isRegistering && (
                        <>
                        <label htmlFor="displayName">
                            Player Name
                            </label>
                            
                            <input
                                id="displayName"
                                type="text"
                                value={displayName}
                                onChange={(event) => 
                                    setDisplayName(event.target.value)
                                }
                                placeholder="Enter your player name"
                                required
                                />
                                </>
                    )}

                    <label htmlFor="email">
                        Email Address
                    </label>

                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(event) =>
                            setEmail(event.target.value)
                        }
                        placeholder="Enter your email"
                        required
                        />

                        <label htmlFor="password">
                            Password
                        </label>

                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(event) => 
                                setPassword(event.target.value)
                            }
                            placeholder="Enter your password"
                            minLength={6}
                            required
                            />

                            {error && (
                                <p className="auth-error" role="alert">
                                    {error}
                                </p>
                            )}

                            <button type="submit" disabled={loading}>
                                {loading
                                    ? 'Please wait...'
                                    : isRegistering
                                        ? 'Create Account'
                                        : 'Sign In'}
                            </button>
                </form>

                <p className="auth-toggle">
                    {isRegistering
                        ? 'Already have an account?'
                        : "Don't have an account?"}

                        {' '}

                        <button
                            type="button"
                            className="text-button"
                            onClick={() => {
                                setIsRegistering(!isRegistering)
                                setError('')
                            }}
                            >
                                {isRegistering ? 'Sign In' : 'Register'}
                            </button>
                </p>
            </section>
        </main>
    )
}

export default Auth