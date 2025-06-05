import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, BookOpen, Target, Trophy, Clock, Moon, Sun } from 'lucide-react';
import { SubjectSelectionScreen } from '@/components/mcq/SubjectSelectionScreen';
import { ChapterSelectionScreen } from '@/components/mcq/ChapterSelectionScreen';
import { QuizSettingsScreen } from '@/components/mcq/QuizSettingsScreen';
import { MCQDisplay } from '@/components/mcq/MCQDisplay';
import { ProgressTracker } from '@/components/mcq/ProgressTracker';
import { useTheme } from 'next-themes';
import { useAuth } from '@/hooks/useAuth';
import { getUserStats, Subject, Chapter } from '@/utils/mcqData';
type Screen = 'subjects' | 'chapters' | 'settings' | 'quiz';
const MCQs = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('subjects');
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timePerQuestion, setTimePerQuestion] = useState(30);
  const [userStats, setUserStats] = useState({
    totalQuestions: 0,
    correctAnswers: 0,
    accuracy: 0,
    averageTime: 0,
    bestStreak: 0
  });
  const {
    theme,
    setTheme
  } = useTheme();
  const {
    user
  } = useAuth();
  useEffect(() => {
    const loadUserStats = async () => {
      if (user?.id) {
        const stats = await getUserStats(user.id);
        setUserStats(stats);
      }
    };
    loadUserStats();
  }, [user?.id]);
  const handleSubjectSelect = (subject: Subject) => {
    setSelectedSubject(subject);
    setCurrentScreen('chapters');
  };
  const handleChapterSelect = (chapter: Chapter) => {
    setSelectedChapter(chapter);
    setCurrentScreen('settings');
  };
  const handleStartQuiz = (timerEnabledValue: boolean, timePerQuestionValue: number) => {
    setTimerEnabled(timerEnabledValue);
    setTimePerQuestion(timePerQuestionValue);
    setCurrentScreen('quiz');
  };
  const handleBackToSubjects = () => {
    setCurrentScreen('subjects');
    setSelectedSubject(null);
    setSelectedChapter(null);
  };
  const handleBackToChapters = () => {
    setCurrentScreen('chapters');
    setSelectedChapter(null);
  };
  const handleBackToSettings = () => {
    setCurrentScreen('settings');
  };
  const renderContent = () => {
    switch (currentScreen) {
      case 'subjects':
        return <SubjectSelectionScreen onSubjectSelect={handleSubjectSelect} />;
      case 'chapters':
        return selectedSubject ? <ChapterSelectionScreen subject={selectedSubject} onChapterSelect={handleChapterSelect} onBack={handleBackToSubjects} /> : null;
      case 'settings':
        return selectedSubject && selectedChapter ? <QuizSettingsScreen subject={selectedSubject} chapter={selectedChapter} onStartQuiz={handleStartQuiz} onBack={handleBackToChapters} /> : null;
      case 'quiz':
        return selectedSubject && selectedChapter ? <MCQDisplay subject={selectedSubject.id} chapter={selectedChapter.id} onBack={handleBackToSettings} timerEnabled={timerEnabled} timePerQuestion={timePerQuestion} /> : null;
      default:
        return <SubjectSelectionScreen onSubjectSelect={handleSubjectSelect} />;
    }
  };
  return <div className="min-h-screen w-full bg-gradient-to-br from-white via-purple-50/30 to-pink-50/30 dark:bg-gradient-to-br dark:from-gray-900 dark:via-purple-900/10 dark:to-pink-900/10">
      {/* Header */}
      <header className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-b border-purple-200 dark:border-purple-800 sticky top-0 z-50">
        <div className="container mx-auto px-3 sm:px-4 lg:px-8 py-3 sm:py-4 flex justify-between items-center max-w-full">
          <Link to="/dashboard" className="flex items-center space-x-1 sm:space-x-2 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors">
            <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" />
            
          </Link>
          
          <div className="flex items-center space-x-2 sm:space-x-3">
            <img src="/lovable-uploads/bf69a7f7-550a-45a1-8808-a02fb889f8c5.png" alt="Medistics Logo" className="w-6 h-6 sm:w-8 sm:h-8 object-contain" />
            <span className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white hidden sm:inline">Practice MCQs</span>
            <span className="text-sm font-bold text-gray-900 dark:text-white sm:hidden">MCQs</span>
          </div>
          
          <div className="flex items-center space-x-2 sm:space-x-3">
            <Button variant="ghost" size="sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="w-8 h-8 sm:w-9 sm:h-9 p-0 hover:scale-110 transition-transform duration-200">
              {theme === "dark" ? <Sun className="h-3 w-3 sm:h-4 sm:w-4" /> : <Moon className="h-3 w-3 sm:h-4 sm:w-4" />}
            </Button>
            <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 border-purple-300 dark:border-purple-700 text-xs sm:text-sm px-2 py-1">
              Basic Plan
            </Badge>
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-xs sm:text-sm">
                {user?.email?.substring(0, 2).toUpperCase() || 'U'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-8 max-w-full">
        {/* Show hero section and stats only on subjects screen */}
        {currentScreen === 'subjects' && <>
            {/* Hero Section */}
            <div className="text-center mb-6 sm:mb-8 animate-fade-in">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">
                📚 MCQ Practice
              </h1>
              <p className="text-base sm:text-lg md:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto px-4 sm:px-0">
                Master medical concepts with our comprehensive MCQ practice system. 
                Choose your subject and chapter to begin your learning journey.
              </p>
            </div>

            {/* Progress Tracker */}
            <div className="mb-6 sm:mb-8">
              <ProgressTracker userId={user?.id} />
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-6 sm:mb-8">
              <Card className="text-center bg-gradient-to-br from-purple-100/70 via-purple-50/50 to-pink-50/30 dark:from-purple-900/30 dark:via-purple-800/20 dark:to-pink-900/10 border-purple-200 dark:border-purple-800 hover:scale-105 transition-transform duration-300 animate-fade-in backdrop-blur-sm">
                <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
                  <BookOpen className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 mx-auto mb-1 sm:mb-2 text-purple-600 dark:text-purple-400" />
                  <CardTitle className="text-xs sm:text-sm text-gray-900 dark:text-white">Questions Practiced</CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                  <div className="text-lg sm:text-xl md:text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {userStats.totalQuestions}
                  </div>
                </CardContent>
              </Card>

              <Card className="text-center bg-gradient-to-br from-purple-100/70 via-purple-50/50 to-pink-50/30 dark:from-purple-900/30 dark:via-purple-800/20 dark:to-pink-900/10 border-purple-200 dark:border-purple-800 hover:scale-105 transition-transform duration-300 animate-fade-in backdrop-blur-sm">
                <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
                  <Target className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 mx-auto mb-1 sm:mb-2 text-green-600 dark:text-green-400" />
                  <CardTitle className="text-xs sm:text-sm text-gray-900 dark:text-white">Accuracy Rate</CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                  <div className="text-lg sm:text-xl md:text-2xl font-bold text-green-600 dark:text-green-400">
                    {userStats.accuracy}%
                  </div>
                </CardContent>
              </Card>

              <Card className="text-center bg-gradient-to-br from-purple-100/70 via-purple-50/50 to-pink-50/30 dark:from-purple-900/30 dark:via-purple-800/20 dark:to-pink-900/10 border-purple-200 dark:border-purple-800 hover:scale-105 transition-transform duration-300 animate-fade-in backdrop-blur-sm">
                <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
                  <Trophy className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 mx-auto mb-1 sm:mb-2 text-yellow-600 dark:text-yellow-400" />
                  <CardTitle className="text-xs sm:text-sm text-gray-900 dark:text-white">Best Streak</CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                  <div className="text-lg sm:text-xl md:text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                    {userStats.bestStreak}
                  </div>
                </CardContent>
              </Card>

              <Card className="text-center bg-gradient-to-br from-purple-100/70 via-purple-50/50 to-pink-50/30 dark:from-purple-900/30 dark:via-purple-800/20 dark:to-pink-900/10 border-purple-200 dark:border-purple-800 hover:scale-105 transition-transform duration-300 animate-fade-in backdrop-blur-sm">
                <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
                  <Clock className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 mx-auto mb-1 sm:mb-2 text-blue-600 dark:text-blue-400" />
                  <CardTitle className="text-xs sm:text-sm text-gray-900 dark:text-white">Avg. Time</CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                  <div className="text-lg sm:text-xl md:text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {userStats.averageTime}s
                  </div>
                </CardContent>
              </Card>
            </div>
          </>}

        {/* Render current screen content */}
        {renderContent()}
      </div>
    </div>;
};
export default MCQs;