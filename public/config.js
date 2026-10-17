// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Configuração do endereço da API do Sistema Eclesia
// Se o seu servidor backend (pasta server) estiver publicado num serviço externo (ex: Render, Railway, Fly.io),
// substitua o valor abaixo pelo URL completo (ex: "https://minha-api-eclesia.onrender.com").
window.ECLESIA_API_BASE = window.location.origin;

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCiUfUI888vYzvFfMNszoNMmnNwULh0bQ8",
  authDomain: "eclesiaon.firebaseapp.com",
  projectId: "eclesiaon",
  storageBucket: "eclesiaon.firebasestorage.app",
  messagingSenderId: "994799265423",
  appId: "1:994799265423:web:bf64d2da1d36bcd26ab2fa"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export { app, firebaseConfig };