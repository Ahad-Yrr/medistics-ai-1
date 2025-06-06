
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';

const Signup = () => {
  const { signUp, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    fullName: '',
    password: '',
    confirmPassword: ''
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [emailExists, setEmailExists] = useState(false);
  const [usernameExists, setUsernameExists] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // Email validation and availability check
  useEffect(() => {
    const checkEmail = async () => {
      if (formData.email && formData.email.includes('@') && formData.email.length > 5) {
        setCheckingEmail(true);
        setEmailExists(false); // Always allow signup, just checking format
        setCheckingEmail(false);
      } else {
        setEmailExists(false);
      }
    };

    const timeoutId = setTimeout(checkEmail, 1000);
    return () => clearTimeout(timeoutId);
  }, [formData.email]);

  // Username validation and availability check
  useEffect(() => {
    const checkUsername = async () => {
      if (formData.username && formData.username.length >= 3) {
        setCheckingUsername(true);
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('username')
            .eq('username', formData.username)
            .maybeSingle();
          
          setUsernameExists(!!data && !error);
        } catch (error) {
          console.error('Error checking username:', error);
          setUsernameExists(false);
        }
        setCheckingUsername(false);
      } else {
        setUsernameExists(false);
      }
    };

    const timeoutId = setTimeout(checkUsername, 1000);
    return () => clearTimeout(timeoutId);
  }, [formData.username]);

  // Real-time validation
  useEffect(() => {
    const errors: Record<string, string> = {};

    // Email validation
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    // Username validation
    if (formData.username && formData.username.length < 3) {
      errors.username = 'Username must be at least 3 characters';
    }
    if (formData.username && !/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      errors.username = 'Username can only contain letters, numbers, and underscores';
    }
    if (usernameExists) {
      errors.username = 'This username is already taken';
    }

    // Full name validation
    if (formData.fullName && formData.fullName.length < 2) {
      errors.fullName = 'Full name must be at least 2 characters';
    }

    // Password validation
    if (formData.password) {
      if (formData.password.length < 8) {
        errors.password = 'Password must be at least 8 characters';
      } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
        errors.password = 'Password must contain at least one uppercase letter, one lowercase letter, and one number';
      }
    }

    // Confirm password validation
    if (formData.confirmPassword && formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    setValidationErrors(errors);
  }, [formData, usernameExists]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check for validation errors
    if (Object.keys(validationErrors).length > 0) {
      toast({
        title: "Validation Error",
        description: "Please fix the errors before submitting",
        variant: "destructive",
      });
      return;
    }

    if (usernameExists) {
      toast({
        title: "Username Taken",
        description: "Please choose a different username",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      console.log('Submitting signup with data:', {
        email: formData.email,
        fullName: formData.fullName,
        username: formData.username
      });

      const { data, error } = await signUp(formData.email, formData.password, {
        fullName: formData.fullName,
        username: formData.username
      });

      if (!error && data) {
        toast({
          title: "Account Created!",
          description: "Welcome to Medistics! You can now start learning.",
        });
        navigate('/dashboard');
      }
    } catch (error: any) {
      console.error('Signup submission error:', error);
      toast({
        title: "Error",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getInputIcon = (fieldName: string, isChecking: boolean, hasError: boolean, hasValue: boolean) => {
    if (isChecking) {
      return <div className="animate-spin w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full" />;
    }
    if (hasValue && !hasError) {
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    }
    if (hasError) {
      return <XCircle className="w-4 h-4 text-red-500" />;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 animate-fade-in">
        <div className="text-center">
          <Link to="/" className="inline-flex items-center text-purple-600 hover:text-purple-700 mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Create Account</h1>
          <p className="text-gray-600 dark:text-gray-300">Join the best medical learning platform</p>
        </div>

        <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-purple-200 dark:border-purple-800">
          <CardHeader>
            <CardTitle>Sign Up</CardTitle>
            <CardDescription>Enter your details to create your account</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="Enter your email"
                    className={validationErrors.email ? "border-red-500" : ""}
                    required
                  />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    {getInputIcon('email', checkingEmail, !!validationErrors.email, !!formData.email)}
                  </div>
                </div>
                {validationErrors.email && (
                  <p className="text-red-500 text-sm">{validationErrors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <div className="relative">
                  <Input
                    id="username"
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    placeholder="Choose a username"
                    className={validationErrors.username ? "border-red-500" : ""}
                    required
                  />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    {getInputIcon('username', checkingUsername, !!validationErrors.username, !!formData.username)}
                  </div>
                </div>
                {validationErrors.username && (
                  <p className="text-red-500 text-sm">{validationErrors.username}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <div className="relative">
                  <Input
                    id="fullName"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    placeholder="Enter your full name"
                    className={validationErrors.fullName ? "border-red-500" : ""}
                    required
                  />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    {getInputIcon('fullName', false, !!validationErrors.fullName, !!formData.fullName)}
                  </div>
                </div>
                {validationErrors.fullName && (
                  <p className="text-red-500 text-sm">{validationErrors.fullName}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="Create a password"
                    className={validationErrors.password ? "border-red-500" : ""}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {validationErrors.password && (
                  <p className="text-red-500 text-sm">{validationErrors.password}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    placeholder="Confirm your password"
                    className={validationErrors.confirmPassword ? "border-red-500" : ""}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {validationErrors.confirmPassword && (
                  <p className="text-red-500 text-sm">{validationErrors.confirmPassword}</p>
                )}
              </div>

              <Button 
                type="submit" 
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700" 
                disabled={loading || Object.keys(validationErrors).length > 0 || usernameExists}
              >
                {loading ? 'Creating Account...' : 'Create Account'}
              </Button>
            </form>

            <div className="text-center mt-4">
              <p className="text-gray-600 dark:text-gray-300">
                Already have an account?{' '}
                <Link to="/login" className="text-purple-600 hover:text-purple-700 font-medium">
                  Sign in
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Signup;
