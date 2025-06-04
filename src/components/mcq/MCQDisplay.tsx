
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Clock, CheckCircle, XCircle, Timer } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';
import { fetchMCQsByChapter, MCQ } from '@/utils/mcqData';
import { supabase } from '@/integrations/supabase/client';

interface MCQDisplayProps {
  subject: string;
  chapter: string;
  onBack: () => void;
  timerEnabled?: boolean;
  timePerQuestion?: number;
}

interface ShuffledMCQ extends Omit<MCQ, 'options'> {
  shuffledOptions: string[];
  originalCorrectIndex: number;
}

// Fisher-Yates shuffle algorithm
const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export const MCQDisplay = ({ 
  subject, 
  chapter, 
  onBack, 
  timerEnabled = false, 
  timePerQuestion = 30 
}: MCQDisplayProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [mcqs, setMcqs] = useState<ShuffledMCQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [timeLeft, setTimeLeft] = useState(timePerQuestion);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [score, setScore] = useState(0);

  useEffect(() => {
    const loadMCQs = async () => {
      setLoading(true);
      const data = await fetchMCQsByChapter(chapter);
      
      // Shuffle options for each MCQ
      const shuffledMCQs = data.map(mcq => {
        const correctAnswerIndex = mcq.options.indexOf(mcq.correct_answer);
        const shuffledOptions = shuffleArray(mcq.options);
        const newCorrectIndex = shuffledOptions.indexOf(mcq.correct_answer);
        
        return {
          ...mcq,
          shuffledOptions,
          originalCorrectIndex: newCorrectIndex
        };
      });
      
      setMcqs(shuffledMCQs);
      setLoading(false);
    };

    loadMCQs();
  }, [chapter]);

  useEffect(() => {
    setStartTime(Date.now());
    setTimeLeft(timePerQuestion);
  }, [currentQuestionIndex, timePerQuestion]);

  useEffect(() => {
    if (!timerEnabled || showExplanation || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Time's up - auto submit
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timerEnabled, showExplanation, timeLeft]);

  const currentMCQ = mcqs[currentQuestionIndex];
  const totalQuestions = mcqs.length;
  const progressPercentage = totalQuestions > 0 ? ((currentQuestionIndex + 1) / totalQuestions) * 100 : 0;

  const handleTimeUp = () => {
    if (!showExplanation) {
      handleSubmitAnswer(true);
    }
  };

  const handleAnswerSelect = (answer: string) => {
    if (showExplanation) return;
    setSelectedAnswer(answer);
  };

  const handleSubmitAnswer = async (timeUp = false) => {
    if (!currentMCQ || !user) return;

    const answer = timeUp ? '' : selectedAnswer;
    const timeTaken = Math.floor((Date.now() - startTime) / 1000);
    const isCorrect = answer === currentMCQ.correct_answer;
    
    if (isCorrect && !timeUp) {
      setScore(prev => prev + 1);
    }

    // Save answer to database
    try {
      await supabase.from('user_answers').insert({
        user_id: user.id,
        mcq_id: currentMCQ.id,
        selected_answer: answer || 'No answer',
        is_correct: isCorrect,
        time_taken: timeTaken
      });
    } catch (error) {
      console.error('Error saving answer:', error);
    }

    setShowExplanation(true);
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setShowExplanation(false);
      setTimeLeft(timePerQuestion);
    } else {
      // Quiz completed
      toast({
        title: "Quiz Completed!",
        description: `You scored ${score}/${totalQuestions} (${Math.round((score/totalQuestions)*100)}%)`,
      });
      
      onBack();
    }
  };

  if (loading) {
    return (
      <Card className="bg-gradient-to-br from-purple-100/70 via-purple-50/50 to-pink-50/30 dark:from-purple-900/30 dark:via-purple-800/20 dark:to-pink-900/10 border-purple-200 dark:border-purple-800 backdrop-blur-sm mx-2 sm:mx-0">
        <CardContent className="text-center py-6 sm:py-8">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">Loading questions...</p>
        </CardContent>
      </Card>
    );
  }

  if (!mcqs || mcqs.length === 0) {
    return (
      <Card className="bg-gradient-to-br from-purple-100/70 via-purple-50/50 to-pink-50/30 dark:from-purple-900/30 dark:via-purple-800/20 dark:to-pink-900/10 border-purple-200 dark:border-purple-800 backdrop-blur-sm mx-2 sm:mx-0">
        <CardContent className="text-center py-6 sm:py-8">
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">No questions available for this chapter.</p>
          <Button onClick={onBack} className="mt-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-sm sm:text-base">
            <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
            Back to Chapters
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-2 sm:px-0">
      <Button 
        variant="outline" 
        onClick={onBack}
        className="mb-4 sm:mb-6 flex items-center space-x-2 border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/30 text-sm sm:text-base"
      >
        <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" />
        <span>Back to Chapters</span>
      </Button>

      {/* Progress Header */}
      <Card className="mb-4 sm:mb-6 bg-gradient-to-br from-purple-100/70 via-purple-50/50 to-pink-50/30 dark:from-purple-900/30 dark:via-purple-800/20 dark:to-pink-900/10 border-purple-200 dark:border-purple-800 backdrop-blur-sm">
        <CardHeader className="px-4 sm:px-6 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-2 sm:space-y-0">
            <CardTitle className="text-base sm:text-lg text-gray-900 dark:text-white">
              Question {currentQuestionIndex + 1} of {totalQuestions}
            </CardTitle>
            <div className="flex items-center space-x-3 sm:space-x-4 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
              {timerEnabled && (
                <div className={`flex items-center space-x-1 ${timeLeft <= 10 ? 'text-red-500' : ''}`}>
                  <Timer className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span>{timeLeft}s</span>
                </div>
              )}
              <div className="flex items-center space-x-1">
                <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>Score: {score}/{currentQuestionIndex}</span>
              </div>
            </div>
          </div>
          <Progress value={progressPercentage} className="w-full" />
          {timerEnabled && (
            <Progress 
              value={(timeLeft / timePerQuestion) * 100} 
              className="w-full h-2 mt-2"
              style={{
                background: timeLeft <= 10 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(147, 51, 234, 0.2)'
              }}
            />
          )}
        </CardHeader>
      </Card>

      {/* Question Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestionIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="bg-gradient-to-br from-purple-100/70 via-purple-50/50 to-pink-50/30 dark:from-purple-900/30 dark:via-purple-800/20 dark:to-pink-900/10 border-purple-200 dark:border-purple-800 backdrop-blur-sm">
            <CardHeader className="px-4 sm:px-6 py-4 sm:py-6">
              <CardTitle className="text-base sm:text-lg leading-relaxed text-gray-900 dark:text-white">
                {currentMCQ?.question}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
              <div className="space-y-2 sm:space-y-3">
                {currentMCQ?.shuffledOptions.map((option, index) => {
                  const isSelected = selectedAnswer === option;
                  const isCorrect = option === currentMCQ.correct_answer;
                  const showResult = showExplanation;
                  
                  let buttonClass = "w-full p-3 sm:p-4 text-left border-2 rounded-lg transition-all duration-200 text-sm sm:text-base ";
                  
                  if (showResult) {
                    if (isCorrect) {
                      buttonClass += "bg-green-50 dark:bg-green-900/30 border-green-500 text-green-700 dark:text-green-400";
                    } else if (isSelected && !isCorrect) {
                      buttonClass += "bg-red-50 dark:bg-red-900/30 border-red-500 text-red-700 dark:text-red-400";
                    } else {
                      buttonClass += "bg-gray-50 dark:bg-gray-800/50 border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400";
                    }
                  } else {
                    if (isSelected) {
                      buttonClass += "bg-purple-50 dark:bg-purple-900/50 border-purple-500 text-purple-700 dark:text-purple-300";
                    } else {
                      buttonClass += "bg-white dark:bg-gray-800/50 border-gray-300 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30";
                    }
                  }

                  return (
                    <motion.button
                      key={index}
                      className={buttonClass}
                      onClick={() => handleAnswerSelect(option)}
                      disabled={showExplanation}
                      whileHover={!showExplanation ? { scale: 1.01 } : {}}
                      whileTap={!showExplanation ? { scale: 0.99 } : {}}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-gray-900 dark:text-white flex-1">{String.fromCharCode(65 + index)}. {option}</span>
                        {showResult && isCorrect && <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 ml-2" />}
                        {showResult && isSelected && !isCorrect && <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 ml-2" />}
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              {/* Explanation */}
              {showExplanation && currentMCQ?.explanation && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-4 sm:mt-6 p-3 sm:p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border border-blue-200 dark:border-blue-800 rounded-lg"
                >
                  <h4 className="font-semibold text-blue-900 dark:text-blue-200 mb-2 text-sm sm:text-base">Explanation:</h4>
                  <p className="text-blue-800 dark:text-blue-300 text-sm sm:text-base">{currentMCQ.explanation}</p>
                </motion.div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end space-x-2 sm:space-x-3 mt-4 sm:mt-6">
                {!showExplanation && selectedAnswer && (
                  <Button 
                    onClick={() => handleSubmitAnswer()}
                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-sm sm:text-base px-4 sm:px-6"
                  >
                    Submit Answer
                  </Button>
                )}
                
                {showExplanation && (
                  <Button 
                    onClick={handleNextQuestion}
                    className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-sm sm:text-base px-4 sm:px-6"
                  >
                    {currentQuestionIndex < totalQuestions - 1 ? 'Next Question' : 'Finish Quiz'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
