import { loadStripe } from '@stripe/stripe-js';

// Stripe publishable key - replace with your actual key
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder';

// Price ID for the $15/month premium subscription
export const PREMIUM_PRICE_ID = import.meta.env.VITE_STRIPE_PRICE_ID || 'price_1T87iSBM2OQUL1iISrZvHHvr';

// Initialize Stripe
let stripePromise: ReturnType<typeof loadStripe> | null = null;

export const getStripe = () => {
  if (!stripePromise) {
    stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
  }
  return stripePromise;
};

// Premium features
export const PREMIUM_FEATURES = [
  'Live odds from The Odds API',
  'Advanced backtesting with real historical data',
  'Unlimited game analysis',
  'Email alerts for value bets',
  'Priority support',
  'API access for custom integrations',
];

export const FREE_FEATURES = [
  'Basic ML predictions',
  'Demo games for NBA, NFL, MLB',
  'Basic backtesting (simulated)',
  'Manual game analysis',
];

/**
 * Check if user has premium access
 *
 * SECURITY WARNING: This implementation uses localStorage for demo purposes only.
 * localStorage is CLIENT-SIDE ONLY and can be tampered with by any user via the browser console:
 *   localStorage.setItem('ai_advantage_premium', 'true')
 *
 * IN PRODUCTION, implement server-side verification:
 * 1. Store premium status on secure backend database
 * 2. Use signed JWT tokens or secure session cookies
 * 3. Verify token signature on each API request
 * 4. Never trust client-side storage for security-critical data
 *
 * This is a DEMO version. Do not use in production without server-side auth.
 */
export const isPremiumUser = (): boolean => {
  if (typeof window === 'undefined') return false;

  // Dev warning for local development
  if (import.meta.env.DEV) {
    const stored = localStorage.getItem('ai_advantage_premium');
    if (stored === 'true') {
      console.warn(
        '[SECURITY] Premium status from localStorage. This is CLIENT-SIDE ONLY and can be spoofed. ' +
        'Implement server-side verification in production.'
      );
    }
  }

  return localStorage.getItem('ai_advantage_premium') === 'true';
};

export const setPremiumStatus = (isPremium: boolean): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('ai_advantage_premium', isPremium ? 'true' : 'false');
};

// Redirect to Stripe Checkout
export const redirectToCheckout = async (type: 'premium' | 'one-time' = 'premium'): Promise<void> => {
  const stripe = await getStripe();
  if (!stripe) {
    console.error('Stripe not loaded');
    return;
  }

  let checkoutUrl = '';
  if (type === 'premium') {
    checkoutUrl = import.meta.env.VITE_STRIPE_CHECKOUT_URL || 'https://buy.stripe.com/test_fZu28qbrObYi7vf6c19R604';
  } else {
    checkoutUrl = import.meta.env.VITE_STRIPE_ONE_TIME_CHECKOUT_URL || 'https://buy.stripe.com/test_eVqbJ03Zm4vQ2aV43T9R605';
  }
  
  if (checkoutUrl) {
    window.location.href = checkoutUrl;
  } else {
    // Demo mode - just set premium status
    console.log('Demo mode: Setting premium status');
    setPremiumStatus(true);
    window.location.reload();
  }
};

// Email subscription
export const subscribeEmail = async (email: string): Promise<{ success: boolean; message: string }> => {
  // In production, you'd send this to your backend/email service
  // For now, store in localStorage and return success
  if (!email || !email.includes('@')) {
    return { success: false, message: 'Please enter a valid email address' };
  }

  try {
    // Store email locally (in production, send to backend)
    const emails = JSON.parse(localStorage.getItem('ai_advantage_emails') || '[]');
    if (!emails.includes(email)) {
      emails.push(email);
      localStorage.setItem('ai_advantage_emails', JSON.stringify(emails));
    }
    
    return { success: true, message: 'Thanks for subscribing! Check your inbox for updates.' };
  } catch {
    return { success: false, message: 'Something went wrong. Please try again.' };
  }
};
