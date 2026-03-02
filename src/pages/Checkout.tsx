import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Moon,
    Sun,
    CheckCircle,
    XCircle,
    BadgePercent,
    CreditCard,
    ArrowLeft,
    Loader2,
    Wallet,
} from 'lucide-react';
import { Link, useLocation, Navigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { ProfileDropdown } from '@/components/ProfileDropdown';
import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import Seo from '@/components/Seo';
import { cn } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

const Checkout = () => {
    const { user } = useAuth();
    const { theme, setTheme } = useTheme();
    const location = useLocation();

    const [isLoading, setIsLoading] = useState(false);
    const [isRedirecting, setIsRedirecting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Defaulted to payfast since easypaisa is disabled
    const [paymentMethod, setPaymentMethod] = useState<'easypaisa' | 'payfast'>('payfast');
    const [modalState, setModalState] = useState<'idle' | 'processing' | 'success' | 'failure'>('idle');
    const [agreedToTerms, setAgreedToTerms] = useState(false);

    const [promoCode, setPromoCode] = useState('');
    const [promoCodeError, setPromoCodeError] = useState<string | null>(null);
    const [discountedPrice, setDiscountedPrice] = useState<number | null>(null);
    const [isPromoApplied, setIsPromoApplied] = useState(false);
    const [promoDiscountDisplay, setPromoDiscountDisplay] = useState<string | null>(null);

    // Manual status check for PayFast fallback or success verification
    const checkPaymentStatus = async () => {
        if (!user) return;

        try {
            const { data } = await supabase
                .from('pending_payments')
                .select('status, error_message')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (data) {
                if (data.status === 'success') {
                    setModalState('success');
                    setIsLoading(false);
                    return true;
                } else if (data.status === 'failed') {
                    setError(data.error_message || "Transaction failed.");
                    setModalState('failure');
                    setIsLoading(false);
                    return true;
                }
            }
        } catch (e) {
            console.error("Status check failed", e);
        }
        return false;
    };

    useEffect(() => {
        if (!user) return;

        const channel = supabase
            .channel('payment-tracking')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'pending_payments',
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    if (payload.new.status === 'success') {
                        setModalState('success');
                        setIsLoading(false);
                    } else if (payload.new.status === 'failed') {
                        setError(payload.new.error_message || "Transaction failed.");
                        setModalState('failure');
                        setIsLoading(false);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, modalState]);

    if (!location.state) {
        return <Navigate to="/pricing" replace />;
    }

    const {
        planName = 'Premium',
        price: basePriceStr,
        duration = 'Monthly',
        currency = 'PKR',
        validity = 'monthly'
    } = location.state;

    const basePrice = basePriceStr ? parseFloat(basePriceStr) : 0;
    const validityDisplay = validity.toLowerCase() === 'yearly' ? 'Validity: 365 Days' : 'Validity: 30 Days';

    // Total calculation: MDR logic removed entirely
    const grandTotal = discountedPrice !== null ? discountedPrice : basePrice;

    const isPayFastDisabled = grandTotal < 20;

    const handleApplyPromoCode = async () => {
        setPromoCodeError(null);
        if (!promoCode) return;
        setIsLoading(true);
        try {
            const { data, error: rpcError } = await supabase.rpc('validate_promo_code', {
                p_code: promoCode,
                p_plan_name: planName,
                p_duration: duration,
                p_currency: currency,
                p_current_price: basePrice,
            });
            if (rpcError) throw rpcError;
            const result = data[0];
            if (result.valid) {
                setDiscountedPrice(result.adjusted_price);
                setIsPromoApplied(true);
                setPromoDiscountDisplay(result.discount_type === 'percentage' ? `${result.discount_value}% OFF` : `Discount Applied`);
            } else {
                setPromoCodeError(result.error_message || 'Invalid code');
            }
        } catch (err: any) {
            setPromoCodeError('Failed to validate promo code.');
        } finally {
            setIsLoading(false);
        }
    };

    const handlePayFastPayment = async () => {
        setIsLoading(true);
        setError(null);
        const basketId = `ORD-${Date.now()}`;
        const finalAmount = grandTotal.toFixed(2);

        try {
            const { error: insertError } = await supabase
                .from('pending_payments')
                .insert([{
                    user_id: user?.id,
                    amount: finalAmount,
                    order_id: basketId,
                    status: 'initiated',
                    validity,
                    email: user?.email,
                    plan_name: planName
                }]);

            if (insertError) {
                throw new Error("Could not initialize transaction. Check your internet connection.");
            }

            const response = await fetch('https://medistics.app/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: finalAmount, basketId })
            });

            const text = await response.text();
            let data;
            try {
                data = text ? JSON.parse(text) : null;
            } catch (e) {
                throw new Error("Payment server returned invalid response.");
            }

            if (!response.ok || !data?.ACCESS_TOKEN) {
                throw new Error(data?.message || "Failed to get payment token.");
            }

            setIsRedirecting(true);

            const form = document.createElement('form');
            form.method = 'POST';
            form.action = "https://ipguat.apps.net.pk/Ecommerce/api/Transaction/PostTransaction";

            const fields = {
                MERCHANT_ID: "248744",
                Merchant_Name: "MEMACS Pakistan",
                MERCHANT_USERAGENT: navigator.userAgent,
                TOKEN: data.ACCESS_TOKEN,
                PROCCODE: "00",
                TXNAMT: finalAmount,
                CUSTOMER_MOBILE_NO: "03000000000",
                CUSTOMER_EMAIL_ADDRESS: user?.email || "",
                SUCCESS_URL: `${window.location.origin}/payment-success?plan=${planName}&validity=${validity}`,
                FAILURE_URL: `${window.location.origin}/payment-failure`,
                CHECKOUT_URL: `${window.location.origin}/api/payment-webhook`,
                BASKET_ID: basketId,
                ORDER_DATE: new Date().toISOString().slice(0, 10),
                SIGNATURE: "PAYMENT_REQ",
                VERSION: "V1.2",
                TXNDESC: `Upgrade to ${planName} (${duration})`,
                CURRENCY_CODE: "PKR",
                P1: user?.id || "",
                P2: planName,
                P3: duration
            };

            Object.entries(fields).forEach(([key, value]) => {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = key;
                input.value = value as string;
                form.appendChild(input);
            });

            document.body.appendChild(form);
            form.submit();
        } catch (err: any) {
            setError(err.message || "An error occurred while starting PayFast.");
            setIsLoading(false);
        }
    };

    const processPayment = () => {
        if (isLoading || isRedirecting) return;
        if (!user) {
            setError("Please sign in to continue.");
            return;
        }
        if (!agreedToTerms) {
            setError("You must agree to the Terms, Privacy, and Refund policies to continue.");
            return;
        }

        if (paymentMethod === 'payfast') {
            handlePayFastPayment();
        } else {
            setError("Selected payment method is currently unavailable.");
        }
    };

    return (
        <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
            <Seo title="Checkout | Medmacs" />

            <header className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border-b border-purple-200 dark:border-purple-800 sticky top-0 z-50">
                <div className="container mx-auto px-4 py-4 flex justify-between items-center">
                    <div className="flex items-center space-x-3">
                        <Link to="/pricing" className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-blue-600">Checkout</span>
                    </div>
                    <div className="flex items-center space-x-4">
                        <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                        </Button>
                        <ProfileDropdown />
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-12 max-w-5xl grid md:grid-cols-2 gap-12">
                <div className="space-y-8">
                    <h2 className="text-2xl font-bold dark:text-white">Order Summary</h2>
                    <Card className="border-purple-100 dark:border-slate-800 shadow-md dark:bg-slate-900">
                        <CardContent className="p-6 space-y-4">
                            <div className="flex justify-between items-start">
                                <div className="flex flex-col">
                                    <span className="text-muted-foreground font-medium dark:text-slate-400">{planName} Plan</span>
                                    <span className="text-[11px] mt-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 rounded font-bold uppercase">
                                        {validityDisplay}
                                    </span>
                                </div>
                                <span className="font-semibold dark:text-white">PKR {basePrice.toFixed(2)}</span>
                            </div>

                            {isPromoApplied && (
                                <div className="flex justify-between text-green-600 dark:text-green-400 text-sm font-medium">
                                    <span className="flex items-center"><BadgePercent className="mr-1.5 h-4 w-4" /> {promoDiscountDisplay}</span>
                                    <span>- PKR {(basePrice - grandTotal).toFixed(2)}</span>
                                </div>
                            )}

                            <div className="pt-6 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
                                <div className="flex flex-col">
                                    <span className="text-sm text-muted-foreground dark:text-slate-400 uppercase font-bold">Grand Total</span>
                                    <span className="text-3xl font-black text-purple-600 dark:text-purple-400">PKR {grandTotal.toFixed(2)}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-3">
                        <label className="text-sm font-semibold dark:text-slate-300">Promo Code</label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Enter code"
                                value={promoCode}
                                className="dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                                disabled={isPromoApplied || isLoading}
                            />
                            <Button variant="outline" onClick={handleApplyPromoCode} disabled={isLoading || isPromoApplied || !promoCode}>
                                {isPromoApplied ? <CheckCircle className="h-4 w-4 text-green-500" /> : 'Apply'}
                            </Button>
                        </div>
                        {promoCodeError && <p className="text-xs text-red-500">{promoCodeError}</p>}
                    </div>
                </div>

                <div className="space-y-6">
                    <h2 className="text-2xl font-bold dark:text-white">Payment Method</h2>
                    <div className="space-y-4">
                        <div
                            className="p-4 border-2 rounded-xl border-slate-200 dark:border-slate-800 opacity-50 grayscale cursor-not-allowed"
                        >
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-3">
                                    <Wallet className="w-5 h-5 text-slate-400" />
                                    <span className="font-bold dark:text-white">Easypaisa</span>
                                </div>
                                <img src="/images/Easypaisa-logo.png" className="h-4 opacity-50" alt="Easypaisa" />
                            </div>
                            <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">Coming Soon</span>
                        </div>

                        <div
                            onClick={() => !isPayFastDisabled && setPaymentMethod('payfast')}
                            className={cn("p-4 border-2 rounded-xl transition-all flex items-center justify-between", isPayFastDisabled ? "opacity-50 grayscale cursor-not-allowed" : "cursor-pointer", paymentMethod === 'payfast' ? "border-purple-600 bg-purple-50/50 dark:bg-purple-900/20" : "border-slate-200 dark:border-slate-800")}
                        >
                            <div className="flex items-center gap-3">
                                <CreditCard className="w-5 h-5 text-purple-600" />
                                <div className="flex flex-col">
                                    <span className="font-bold dark:text-white">Cards / Bank (PayFast)</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-start space-x-3 p-2">
                        <Checkbox
                            id="terms"
                            checked={agreedToTerms}
                            onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
                            className="mt-1"
                        />
                        <label htmlFor="terms" className="text-sm leading-snug text-slate-600 dark:text-slate-400">
                            By continuing to pay to Medistics/Hmacs Studios, you agree to our{' '}
                            <Link to="/terms" className="text-purple-600 hover:underline font-medium">Terms and Conditions</Link>,{' '}
                            <Link to="/privacypolicy" className="text-purple-600 hover:underline font-medium">Privacy Policy</Link>, and{' '}
                            <Link to="/refund-policy" className="text-purple-600 hover:underline font-medium">Refund Policy</Link>.
                        </label>
                    </div>

                    {error && <p className="text-red-500 text-sm font-medium">{error}</p>}

                    <Button
                        className="w-full bg-purple-600 hover:bg-purple-700 h-14 text-xl font-black shadow-lg"
                        onClick={processPayment}
                        disabled={isLoading || isRedirecting}
                    >
                        {(isLoading || isRedirecting) ? <Loader2 className="animate-spin h-6 w-6" /> : `Pay PKR ${grandTotal.toFixed(2)}`}
                    </Button>
                </div>
            </main>

            <Dialog open={modalState !== 'idle'} onOpenChange={(open) => !open && setModalState('idle')}>
                <DialogContent className={cn(
                    "sm:max-w-md dark:bg-slate-900 dark:border-slate-800 transition-all duration-300",
                    "max-sm:fixed max-sm:bottom-0 max-sm:top-auto max-sm:translate-y-0 max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:max-w-full max-sm:border-x-0 max-sm:border-b-0"
                )}>
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                        {modalState === 'processing' && (
                            <>
                                <Loader2 className="h-12 w-12 text-purple-600 animate-spin mb-4" />
                                <DialogTitle className="dark:text-white">Authorizing Payment</DialogTitle>
                                <DialogDescription className="mt-2 dark:text-slate-400 px-4">
                                    Your secure payment session is being prepared. Please do not refresh the page.
                                </DialogDescription>
                            </>
                        )}
                        {modalState === 'success' && (
                            <>
                                <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
                                <DialogTitle className="dark:text-white">Payment Successful!</DialogTitle>
                                <DialogDescription className="mt-2 dark:text-slate-400">Your account has been upgraded.</DialogDescription>
                                <Button className="mt-6 w-full" onClick={() => window.location.href = '/dashboard'}>Continue to Dashboard</Button>
                            </>
                        )}
                        {modalState === 'failure' && (
                            <>
                                <XCircle className="h-16 w-16 text-red-500 mb-4" />
                                <DialogTitle className="dark:text-white">Transaction Failed</DialogTitle>
                                <DialogDescription className="mt-2 text-red-600 px-4">{error || "Something went wrong."}</DialogDescription>
                                <div className="flex gap-2 w-full mt-6">
                                    <Button variant="outline" className="flex-1" onClick={() => setModalState('idle')}>Try Again</Button>
                                    <Button variant="secondary" className="flex-1" onClick={checkPaymentStatus}>Check Again</Button>
                                </div>
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default Checkout;