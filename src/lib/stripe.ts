import { loadStripe } from '@stripe/stripe-js';

// Stripe publishable key - replace with your actual key
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder';

// Price ID for the $15/month premium subscription
export const PREMIUM_PRICE_ID = import.meta.env.VITE_STRIPE_PRICE_ID || 'price_placeholder';

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

// Check if user has premium (stored in localStorage for demo)
export const isPremiumUser = (): boolean => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('ai_advantage_premium') === 'true';
};

export const setPremiumStatus = (isPremium: boolean): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('ai_advantage_premium', isPremium ? 'true' : 'false');
};

// Redirect to Stripe Checkout
export const redirectToCheckout = async (): Promise<void> => {
  const stripe = await getStripe();
  if (!stripe) {
    console.error('Stripe not loaded');
    return;
  }

  // In production, you'd create a checkout session on your backend
  // For now, we'll use Stripe's payment links or show a demo
  const checkoutUrl = import.meta.env.VITE_STRIPE_CHECKOUT_URL;
  
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
