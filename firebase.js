const { initializeApp } = require('firebase/app');
const { getAnalytics } = require('firebase/analytics');

// Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyCuRBniopYZcyYPbZSbkQnTJi62CfRSz0M',
  authDomain: 'sttm-analytics.firebaseapp.com',
  projectId: 'sttm-analytics',
  storageBucket: 'sttm-analytics.appspot.com',
  messagingSenderId: '693307351279',
  appId: '1:693307351279:web:1837dbcd07b3ce7da63b1a',
  measurementId: 'G-Z86MCV3BLS',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

module.exports = { analytics };
