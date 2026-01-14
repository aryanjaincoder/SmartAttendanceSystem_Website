import React, { createContext, useState, useEffect, useContext } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import Loading from './Loading'; // Loading component import karein

// Auth context banayein
const AuthContext = createContext(null);

// Poori app ko 'user' state provide karein
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Firebase listener jo auth state ko sunta hai
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    // Component band hone par listener ko saaf karein
    return () => unsubscribe();
  }, []);

  // Jab tak check ho raha hai, Loading dikhayein
  if (loading) {
    return <Loading />;
  }

  // Value mein 'user' aur 'loading' state provide karein
  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// Ek custom hook banayein taaki 'user' ko kahin bhi use kar sakein
export const useAuth = () => {
  return useContext(AuthContext);
};
