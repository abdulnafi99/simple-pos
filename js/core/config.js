// TAPJERR.io — runtime configuration
//
// FIREBASE: paste your Firebase *web app* config below to switch from Demo Mode
// (browser storage, synced live across tabs on one device) to Cloud Mode
// (Firebase Auth + Firestore + Storage, synced live across every device).
//
// The web config is a public identifier, not a secret — access is enforced by
// firestore.rules / storage.rules. NEVER put service-account / Admin SDK keys here.

export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

export const APP = {
  name: 'TAPJERR.io',
  version: '1.0.0',
  tagline: 'Smart Ordering. Seamless Business.',
  firebaseSdkVersion: '10.14.1',
};

export const isCloudMode = () => Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
