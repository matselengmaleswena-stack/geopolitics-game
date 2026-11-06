import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyA4yKsUkDj36T-NEujQ2C0V8lQbYo7h2vU",
    authDomain: "geopolitics-game-8e785.firebaseapp.com",
    projectId: "geopolitics-game-8e785",
    storageBucket: "geopolitics-game-8e785.firebasestorage.app",
    messagingSenderId: "444998802887",
    appId: "1:444998802887:web:96e2cbea1e02710c358de2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize authentication
export const auth = getAuth(app);

// Initialize Firestore
export const db = getFirestore(app);

export default app;