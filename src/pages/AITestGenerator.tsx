// src/pages/AITestGenerator.tsx

import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from 'next-themes';
import { Moon, Sun, ArrowLeft, Crown, X } from 'lucide-react'; // Added X icon
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

import {
  Card, CardHeader, CardContent, CardFooter, CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ProfileDropdown } from '@/components/ProfileDropdown';
import { Checkbox } from '@/components/ui/checkbox'; // Assuming you have a Checkbox component

interface Question {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
}

// Define all available topics categorized by subject
const allTopics = {
  "Biology": [
    "Homeostasis", "Acellular Life", "Bioenergetics", "Biological Molecules", "Evolution",
    "Reproduction", "Enzymes", "Coordination and Control", "Variation and genetics",
    "Life processes in animals and plantS", "Cell structure and Function",
    "Support and movement", "Immunity", "Respiration", "Digestion", "Inheritance", "Biotechnology"
  ],
  "Chemistry": [
    "Fundamental Concepts", "Carboxylic Acids", "Solids", "Chemical Bonding", "Chemical Equilibrium",
    "Principles of organic chemistry", "Alcohols and Phenones", "S and p block elements", // Corrected typo: Aldehydes and Ketones
    "Aldehydes and Ketones", "Thermochemistry", "Liquids", "Gases", "Reaction Kinetics",
    "Atomic Structure", "electrochemistry", "macromolecules", "industrial chemistry"
  ],
  "Physics": [
    "Force and Motion", "Electronics", "Rotational and circular motion", "Electrostatistics",
    "Electromagnetism", "Electromagnetic Induction", "Waves", "Nuclear Physics", "Work and energy",
    "Fluid Dynamics", "Current and electricity", "Alternating current", "Dawn Of Modern Physics",
    "Atomic Spectra", "Vector and equilibrium"
  ],
  "English/Language Arts": [
    "Tenses & Sentence Structure", "Vocabulary (max 25-30 words)", "Punctuation & Style",
    "READING AND THINKING SKILLS", "FORMAL AND LEXICAL ASPECT OF LANGUAGE", "WRITING SKILLS",
    "Adverb", "Adjective", "Error", "Verb"
  ]
};

const AITestGenerator: React.FC = () => {
  const { user, isLoading: authLoading } = useAuth();
  const { theme, setTheme } = useTheme();

  // Fetch user plan
  const { data: profile, isLoading: planLoading } = useQuery({
    queryKey: ['plan', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
    retry: false
  });

  const plan = profile?.plan?.toLowerCase() || 'free';
  // Access control logic: Only 'premium' plan has access
  const hasAccess = plan === 'premium';

  // Form state for test generation
  const [currentStep, setCurrentStep] = useState(1); // 1: Chapter selection, 2: Question count, 3: Custom prompt, 4: Test taking, 5: Score screen
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [totalQ, setTotalQ] = useState(10); // Default to 10 questions
  const [customPrompt, setCustomPrompt] = useState('');
  const [loading, setLoading] = useState(0); // Changed to number for progress
  const [loadTime, setLoadTime] = useState(0);

  // Test state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null); // Corrected initialization: changed timerRef.current to null
  const [showExitConfirm, setShowExitConfirm] = useState(false); // State for exit confirmation modal

  // Define plan color schemes for the badge
  const planColors = {
    'free': {
      light: 'bg-purple-100 text-purple-800 border-purple-300',
      dark: 'dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-700'
    },
    'premium': {
      light: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      dark: 'dark:bg-yellow-900/30 dark:text-yellow-200 dark:border-yellow-700'
    },
    'iconic': {
      light: 'bg-green-100 text-green-800 border-green-300',
      dark: 'dark:bg-green-900/30 dark:text-green-200 dark:border-green-700'
    },
    'default': {
      light: 'bg-gray-100 text-gray-800 border-gray-300',
      dark: 'dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600'
    }
  };

  // Function to get plan badge classes
  const getPlanBadgeClasses = (planName: string) => {
    const colors = planColors[planName as keyof typeof planColors] || planColors.default;
    return `${colors.light} ${colors.dark}`;
  };

  // Handle chapter selection/deselection - RESTORED FOR MULTIPLE SELECTION
  const handleChapterToggle = (chapter: string) => {
    setSelectedChapters(prev =>
      prev.includes(chapter)
        ? prev.filter(c => c !== chapter)
        : [...prev, chapter]
    );
    setError(null); // Clear error when selection changes
  };

  // Handle confirming chapter selection - MODIFIED FOR SINGLE SELECTION REQUIREMENT
  const handleConfirmChapters = () => {
    if (selectedChapters.length === 1) { // Exactly one chapter must be selected
      setCurrentStep(2); // Move to question count step
      setError(null); // Clear any previous errors
    } else if (selectedChapters.length > 1) {
      setError('You have selected more than one topic; please choose a single topic to continue.');
    } else {
      setError('Please select at least one topic.');
    }
  };

  // Handle confirming question count
  const handleConfirmQuestions = () => {
    if (totalQ > 0 && totalQ <= 20) { // Max 20 questions
      setCurrentStep(3); // Move to custom prompt step
    } else {
      setError('Please enter a valid number of questions (1-20).');
    }
  };

  // Fetch all questions at once - RESTORED TOPIC PARAMETER FOR MULTIPLE SELECTION
  const fetchAll = async () => {
    setError(null);
    setLoading(1); // Start loading progress
    setLoadTime(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setLoadTime(t => t + 1), 1000);

    try {
      const res = await fetch(`https://medistics-ai-bot.vercel.app/generate-ai-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: selectedChapters.join(', '), // Send selected chapters as a comma-separated string
          difficulty: 'medium', // Default difficulty
          count: totalQ,
          prompt: `Strictly adhere to the MDCAT syllabus. ${customPrompt}` // Use customPrompt state
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Status ${res.status}`);
      setQuestions(data.questions);
      setIdx(0);
      setAnswers({});
      setSubmitted(false);
      setCurrentStep(4); // Move to test-taking step
    } catch (e: any) {
      console.error(e);
      setError(e.message);
    } finally {
      setLoading(0); // End loading
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  // answer & navigation
  const select = (i: number, a: string) => !answers[i] && setAnswers(s => ({ ...s, [i]: a }));
  const next = () => idx < questions.length - 1 && setIdx(idx + 1);
  const prev = () => idx > 0 && setIdx(idx - 1);
  // Modified submit to go to score screen
  const submit = () => {
    setSubmitted(true);
    setCurrentStep(5); // Go to score screen
  };
  const score = questions.reduce((acc, q, i) => answers[i] === q.answer ? acc + 1 : acc, 0);

  // Reset test and go back to chapter selection
  const startNewTest = () => {
    setQuestions([]);
    setIdx(0);
    setAnswers({});
    setSubmitted(false);
    setTotalQ(10);
    setCustomPrompt('');
    setSelectedChapters([]); // Clear selected chapters
    setError(null);
    setShowExitConfirm(false); // Close confirmation modal
    setCurrentStep(1); // Go back to the first step
  };

  // Handle exit test midway
  const handleExitTest = () => {
    setShowExitConfirm(true);
  };

  // Confirm exit
  const confirmExit = () => {
    startNewTest();
  };

  // Cancel exit
  const cancelExit = () => {
    setShowExitConfirm(false);
  };


  if (authLoading || planLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900 text-gray-900 dark:text-white"><p>Loading…</p></div>;
  }
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <Link to="/login"><Button>Sign In</Button></Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-white via-purple-50/30 to-pink-50/30 dark:bg-gradient-to-br dark:from-gray-900 dark:via-purple-900/10 dark:to-pink-900/10 text-gray-900 dark:text-gray-100">
      <header className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-b border-purple-200 dark:border-purple-800 sticky top-0 z-50">
        <div className="container mx-auto px-4 lg:px-8 py-4 flex justify-between items-center max-w-7xl">
          <Link to="/dashboard" className="flex items-center space-x-2 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <div className="flex items-center space-x-3">
            <img
              src="/lovable-uploads/bf69a7f7-550a-45a1-8808-a02fb889f8c5.png"
              alt="Medistics Logo"
              className="w-8 h-8 object-contain"
            />
            <span className="text-xl font-bold text-gray-900 dark:text-white">AI Test Generator</span>
          </div>

          <div className="flex items-center space-x-3">
            <Button variant="ghost" size="sm" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="w-9 h-9 p-0 hover:scale-110 transition-transform duration-200">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            {/* Dynamic Plan Badge with dynamic colors, hidden on mobile */}
            <Badge className={`${getPlanBadgeClasses(plan)} hidden sm:block`}>
              {plan.charAt(0).toUpperCase() + plan.slice(1)} Plan
            </Badge>
            <ProfileDropdown />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 lg:px-8 py-8 max-w-7xl">
        {!hasAccess && (
          <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900">
            <div className="text-center p-4">
              <Crown className="w-20 h-20 mx-auto mb-6 text-purple-600 dark:text-purple-400" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Upgrade Required</h1>
              <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">
                Your current plan is not compatible with this feature; upgrade to <span className="text-purple-600 font-bold dark:text-purple-400">Premium</span> to continue.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/pricing">
                  <Button className="bg-purple-600 hover:bg-purple-700 text-white w-full sm:w-auto">Upgrade Your Plan</Button>
                </Link>
                <Link to="/dashboard">
                  <Button className="bg-white text-gray-900 hover:bg-gray-100 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 w-full sm:w-auto">Go to Dashboard</Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {hasAccess && questions.length === 0 && (
          <>
            {currentStep === 1 && (
              <Card className="max-w-3xl mx-auto p-8 bg-white/70 dark:bg-gray-800/70 border-purple-200 dark:border-purple-800 shadow-lg rounded-xl backdrop-blur-sm">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">Select Chapters</h3>
                <div className="space-y-6">
                  {Object.entries(allTopics).map(([subject, topics]) => (
                    <div key={subject}>
                      <h4 className="text-xl font-semibold text-purple-700 dark:text-purple-300 mb-3">{subject}</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {topics.map(topic => (
                          <div key={topic} className="flex items-center space-x-2">
                            <Checkbox
                              id={topic}
                              checked={selectedChapters.includes(topic)}
                              onCheckedChange={() => handleChapterToggle(topic)}
                              // Checkbox is always enabled for multi-selection
                              className="border-purple-400 data-[state=checked]:bg-purple-600 data-[state=checked]:text-white dark:border-purple-600 dark:data-[state=checked]:bg-purple-400"
                            />
                            <label
                              htmlFor={topic}
                              className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-gray-800 dark:text-gray-200`} // No dimming for other options
                            >
                              {topic}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-8 text-center">
                  <Button onClick={handleConfirmChapters} disabled={selectedChapters.length === 0 || selectedChapters.length > 1} className="bg-purple-600 hover:bg-purple-700 text-white w-full sm:w-auto py-3 rounded-lg text-lg font-semibold transition-all duration-200">
                    Confirm Topic
                  </Button>
                  {selectedChapters.length > 1 && (
                    <p className="text-red-600 dark:text-red-400 mt-2 text-center">
                      You have selected more than one topic; please choose a single topic to continue.
                    </p>
                  )}
                  {selectedChapters.length === 0 && error && ( // Display error if no topic selected
                    <p className="text-red-600 dark:text-red-400 mt-2 text-center">{error}</p>
                  )}
                </div>
              </Card>
            )}

            {currentStep === 2 && (
              <Card className="max-w-3xl mx-auto p-8 bg-white/70 dark:bg-gray-800/70 border-purple-200 dark:border-purple-800 shadow-lg rounded-xl backdrop-blur-sm">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">How many questions?</h3>
                {error && <p className="text-red-600 dark:text-red-400 mb-4 text-center">{error}</p>}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                  {[2, 5, 10, 15, 20].map(num => ( // Updated quick selection options
                    <Button
                      key={num}
                      variant={totalQ === num ? "default" : "outline"}
                      onClick={() => setTotalQ(num)}
                      className={`py-3 rounded-lg text-lg font-semibold transition-all duration-200 ${totalQ === num ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 border-gray-300 dark:border-gray-600'}`}
                    >
                      {num} Questions
                    </Button>
                  ))}
                </div>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="customQ" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Or enter custom number (1-20)</label> {/* Updated label */}
                    <input
                      id="customQ"
                      type="number"
                      min={1}
                      max={20} // Max 20 questions
                      className="w-full p-3 border rounded-lg focus:ring-purple-500 focus:border-purple-500 border-purple-300 bg-gray-50 text-gray-900 placeholder:text-gray-500 dark:border-purple-700 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-400"
                      value={totalQ}
                      onChange={e => setTotalQ(Math.max(1, Math.min(20, +e.target.value)))} // Max 20 questions
                    />
                  </div>
                </div>
                <div className="mt-8 flex justify-between">
                  <Button onClick={() => setCurrentStep(1)} variant="outline" className="dark:text-gray-100 dark:border-gray-700 dark:hover:bg-gray-700 hover:bg-purple-50 dark:hover:text-white">
                    Back
                  </Button>
                  <Button onClick={handleConfirmQuestions} disabled={totalQ < 1 || totalQ > 20} className="bg-purple-600 hover:bg-purple-700 text-white">
                    Confirm Questions
                  </Button>
                </div>
              </Card>
            )}

            {currentStep === 3 && (
              <Card className="max-w-3xl mx-auto p-8 bg-white/70 dark:bg-gray-800/70 border-purple-200 dark:border-purple-800 shadow-lg rounded-xl backdrop-blur-sm">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">Custom Prompt (Optional)</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4 text-center">Add specific instructions for the AI to tailor your test.</p>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="customPrompt" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Your prompt</label>
                    <textarea
                      id="customPrompt"
                      className="w-full p-3 border rounded-lg focus:ring-purple-500 focus:border-purple-500 border-purple-300 bg-gray-50 text-gray-900 placeholder:text-gray-500 dark:border-purple-700 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-400"
                      rows={5}
                      placeholder="e.g., 'Focus on clinical scenarios' or 'Include definitions only.'"
                      value={customPrompt}
                      onChange={e => setCustomPrompt(e.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-8 flex justify-between">
                  <Button onClick={() => setCurrentStep(2)} variant="outline" className="dark:text-gray-100 dark:border-gray-700 dark:hover:bg-gray-700 hover:bg-purple-50 dark:hover:text-white">
                    Back
                  </Button>
                  <Button onClick={fetchAll} disabled={loading > 0} className="bg-purple-600 hover:bg-purple-700 text-white">
                    {loading > 0 ? `Generating (${loadTime}s)…` : 'Start Test'}
                  </Button>
                </div>
                {error && <p className="text-red-600 dark:text-red-400 mt-2 text-center">{error}</p>}
              </Card>
            )}
          </>
        )}

        {hasAccess && questions.length > 0 && currentStep === 4 && ( // Only show test if questions exist and step is 4
          <Card className="max-w-2xl mx-auto bg-white/70 dark:bg-gray-800/70 rounded-3xl shadow-xl overflow-hidden border-purple-200 dark:border-purple-800 backdrop-blur-sm">
            {/* Header */}
            <CardHeader className="bg-white dark:bg-gray-900 p-6 text-center border-b border-purple-200 dark:border-purple-800 relative"> {/* Added relative for X button positioning */}
              <CardTitle className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                Question {idx + 1} of {questions.length}
              </CardTitle>
              <Progress
                value={((idx + 1) / questions.length) * 100}
                className="h-3 mt-4 bg-purple-200 dark:bg-purple-700 rounded-full [&>*]:bg-purple-600 [&>*]:dark:bg-purple-400"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={handleExitTest}
                className="absolute top-4 right-4 text-gray-600 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                title="Exit Test"
              >
                <X className="w-5 h-5" />
              </Button>
            </CardHeader>

            {/* Question */}
            <CardContent className="p-8 space-y-8">
              <p className="text-lg leading-relaxed text-gray-800 dark:text-gray-200">
                {questions[idx].question}
              </p>

              {/* Options Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {questions[idx].options.map((opt, i) => {
                  const isSelected = answers[idx] === opt;
                  const isCorrectOption = opt === questions[idx].answer;
                  const answered = typeof answers[idx] === 'string';

                  let base = "flex items-center p-4 rounded-lg border transition-all duration-200 ";
                  if (!answered) {
                    base += "border-gray-300 hover:shadow-lg hover:border-purple-500 cursor-pointer dark:border-gray-700 dark:hover:border-purple-700 ";
                  } else if (isCorrectOption) {
                    base += "border-green-500 bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900 dark:to-green-800 "; // Added gradient
                  } else if (isSelected && !isCorrectOption) {
                    base += "border-red-500 bg-gradient-to-r from-red-50 to-red-100 dark:from-red-900 dark:to-red-800 "; // Added gradient
                  } else {
                    base += "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-700 ";
                  }

                  return (
                    <label key={i} className={base}>
                      <input
                        type="radio"
                        name={`q${idx}`}
                        disabled={answered}
                        checked={isSelected}
                        onChange={() => select(idx, opt)}
                        className="h-5 w-5 text-purple-600 dark:accent-purple-500 focus:ring-purple-500"
                      />
                      <span className="ml-4 text-gray-900 dark:text-gray-100">{opt}</span>
                    </label>
                  );
                })}
              </div>
            </CardContent>

            {/* Correct/Incorrect Remark (moved outside explanation container) */}
            {answers[idx] && (
              <div className="text-center mt-4 mb-2"> {/* Added margin for spacing */}
                <p className={`text-xl font-bold ${answers[idx] === questions[idx].answer ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                  {answers[idx] === questions[idx].answer ? 'Correct!' : 'Incorrect!'}
                </p>
              </div>
            )}

            {/* Explanation */}
            {answers[idx] && (
              <CardFooter className={`p-6 border-t border-gray-200 dark:border-gray-600 ${answers[idx] === questions[idx].answer ? 'bg-green-100 dark:bg-green-700' : 'bg-red-100 dark:bg-red-700'}`}>
                <p className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap text-center">
                  {questions[idx].explanation}
                </p>
              </CardFooter>
            )}

            {/* Navigation */}
            <div className="flex justify-between items-center p-6 bg-white dark:bg-gray-900 border-t border-purple-200 dark:border-purple-800">
              <Button onClick={prev} disabled={idx === 0} variant="outline" className="dark:text-gray-100 dark:border-gray-700 dark:hover:bg-gray-700 hover:bg-purple-50 dark:hover:text-white">
                Previous
              </Button>

              {idx < questions.length - 1 ? (
                <Button onClick={next} disabled={!answers[idx]} className="bg-purple-600 hover:bg-purple-700 text-white">
                  Next
                </Button>
              ) : (
                <div className="space-x-4">
                  {!submitted && (
                    <Button onClick={submit} className="bg-purple-600 hover:bg-purple-700 text-white">
                      Submit Test
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Separate Score Screen */}
        {hasAccess && currentStep === 5 && (
          <Card className="max-w-2xl mx-auto p-8 bg-gradient-to-br from-white to-purple-50 dark:from-gray-800 dark:to-purple-900/50 rounded-3xl shadow-xl overflow-hidden border-purple-200 dark:border-purple-800 backdrop-blur-sm text-center">
            <CardHeader className="bg-white/80 dark:bg-gray-900/80 p-6 border-b border-purple-200 dark:border-purple-800">
              <CardTitle className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Test Completed!</CardTitle>
              <p className="text-lg text-gray-600 dark:text-gray-300">Here are your results:</p>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              <div className="flex flex-col items-center justify-center">
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-200 to-purple-400 dark:from-purple-800 dark:to-purple-600 flex items-center justify-center mb-4 shadow-md">
                  <span className="text-5xl font-bold text-white drop-shadow-lg">{score}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  You scored {score} out of {questions.length}
                </p>
                <p className="text-md text-gray-700 dark:text-gray-300 mt-2">
                  Accuracy: {questions.length > 0 ? Math.round((score / questions.length) * 100) : 0}%
                </p>
              </div>
            </CardContent>
            <CardFooter className="p-6 bg-white/80 dark:bg-gray-900/80 border-t border-purple-200 dark:border-purple-800">
              <div className="flex justify-center w-full space-x-4"> {/* Added space-x-4 for button spacing */}
                <Button onClick={startNewTest} className="bg-purple-600 hover:bg-purple-700 text-white text-lg font-semibold py-3 px-6 rounded-lg shadow-md">
                  Start New Test
                </Button>
                <Link to="/dashboard"> {/* Added Go to Dashboard button */}
                  <Button variant="outline" className="dark:text-gray-100 dark:border-gray-700 dark:hover:bg-gray-700 hover:bg-purple-50 dark:hover:text-white text-lg font-semibold py-3 px-6 rounded-lg shadow-md">
                    Go to Dashboard
                  </Button>
                </Link>
              </div>
            </CardFooter>
          </Card>
        )}

        {/* Exit Confirmation Modal */}
        {showExitConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-sm bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-800 shadow-lg rounded-xl">
              <CardHeader className="p-4 border-b border-purple-200 dark:border-purple-800">
                <CardTitle className="text-lg font-bold text-gray-900 dark:text-white">Confirm Exit</CardTitle>
              </CardHeader>
              <CardContent className="p-4 text-gray-700 dark:text-gray-300">
                Are you sure you want to exit the test? Your current progress will be lost.
              </CardContent>
              <CardFooter className="p-4 border-t border-purple-200 dark:border-purple-800 flex justify-end space-x-2">
                <Button variant="outline" onClick={cancelExit} className="dark:text-gray-100 dark:border-gray-700 dark:hover:bg-gray-700 hover:bg-gray-100">
                  Cancel
                </Button>
                <Button onClick={confirmExit} className="bg-red-600 hover:bg-red-700 text-white">
                  Exit
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
};

export default AITestGenerator;
