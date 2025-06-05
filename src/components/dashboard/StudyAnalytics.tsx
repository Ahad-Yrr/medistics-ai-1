
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { 
  BarChart3, 
  Calendar, 
  Clock, 
  Target, 
  TrendingUp, 
  Brain,
  Award,
  Zap
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export const StudyAnalytics = () => {
  const { user } = useAuth();

  const { data: analytics } = useQuery({
    queryKey: ['study-analytics', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      // Get user answers from last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: recentAnswers } = await supabase
        .from('user_answers')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', sevenDaysAgo.toISOString());

      // Get all user answers for overall stats
      const { data: allAnswers } = await supabase
        .from('user_answers')
        .select('*')
        .eq('user_id', user.id);

      // Get AI tests
      const { data: aiTests } = await supabase
        .from('ai_generated_tests')
        .select('*')
        .eq('user_id', user.id);

      // Get battles
      const { data: battles } = await supabase
        .from('battle_results')
        .select('*')
        .eq('user_id', user.id);

      // Calculate analytics
      const totalQuestions = allAnswers?.length || 0;
      const correctAnswers = allAnswers?.filter(a => a.is_correct)?.length || 0;
      const weeklyQuestions = recentAnswers?.length || 0;
      const weeklyCorrect = recentAnswers?.filter(a => a.is_correct)?.length || 0;
      
      const overallAccuracy = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
      const weeklyAccuracy = weeklyQuestions > 0 ? Math.round((weeklyCorrect / weeklyQuestions) * 100) : 0;
      
      // Calculate average time (if available)
      const answersWithTime = allAnswers?.filter(a => a.time_taken && a.time_taken > 0) || [];
      const avgTime = answersWithTime.length > 0 
        ? Math.round(answersWithTime.reduce((sum, a) => sum + (a.time_taken || 0), 0) / answersWithTime.length)
        : 0;

      // Calculate study streak (consecutive days with activity)
      const studyDates = allAnswers?.map(a => new Date(a.created_at).toDateString()) || [];
      const uniqueStudyDates = [...new Set(studyDates)].sort().reverse();
      
      let currentStreak = 0;
      const today = new Date().toDateString();
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      
      if (uniqueStudyDates.includes(today) || uniqueStudyDates.includes(yesterday)) {
        for (let i = 0; i < uniqueStudyDates.length; i++) {
          const date = new Date(uniqueStudyDates[i]);
          const expectedDate = new Date();
          expectedDate.setDate(expectedDate.getDate() - i);
          
          if (date.toDateString() === expectedDate.toDateString()) {
            currentStreak++;
          } else {
            break;
          }
        }
      }

      return {
        totalQuestions,
        correctAnswers,
        overallAccuracy,
        weeklyQuestions,
        weeklyAccuracy,
        avgTime,
        currentStreak,
        testsGenerated: aiTests?.length || 0,
        battlesPlayed: battles?.length || 0,
        battlesWon: battles?.filter(b => b.rank === 1)?.length || 0
      };
    },
    enabled: !!user?.id
  });

  if (!analytics) return null;

  const weeklyGoal = 50; // Target questions per week
  const weeklyProgress = Math.min((analytics.weeklyQuestions / weeklyGoal) * 100, 100);

  return (
    <div className="space-y-4">
      {/* Weekly Progress */}
      <Card className="bg-gradient-to-br from-white to-purple-50/50 dark:from-gray-800 dark:to-purple-900/20 border-purple-200 dark:border-purple-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center space-x-2 text-gray-900 dark:text-white text-lg">
            <Target className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <span>Weekly Goal</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Questions Answered</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {analytics.weeklyQuestions}/{weeklyGoal}
              </span>
            </div>
            <Progress value={weeklyProgress} className="h-2" />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>{analytics.weeklyAccuracy}% accuracy this week</span>
              <span>{Math.round(weeklyProgress)}% complete</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Study Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg flex items-center justify-center">
                <Calendar className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                  {analytics.currentStreak}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Day Streak</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg flex items-center justify-center">
                <Clock className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold text-green-600 dark:text-green-400">
                  {analytics.avgTime}s
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Avg Time</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-purple-200 dark:border-purple-800">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg flex items-center justify-center">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
                  {analytics.testsGenerated}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">AI Tests</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 border-orange-200 dark:border-orange-800">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-orange-600 to-red-600 rounded-lg flex items-center justify-center">
                <Award className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
                  {analytics.battlesWon}/{analytics.battlesPlayed}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Battles Won</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Insights */}
      <Card className="bg-gradient-to-br from-white to-purple-50/50 dark:from-gray-800 dark:to-purple-900/20 border-purple-200 dark:border-purple-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center space-x-2 text-gray-900 dark:text-white text-lg">
            <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <span>Performance Insights</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {analytics.overallAccuracy}%
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Overall Accuracy</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {analytics.totalQuestions}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Total Questions</div>
            </div>
          </div>
          
          {analytics.weeklyAccuracy > analytics.overallAccuracy && (
            <div className="flex items-center space-x-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <Zap className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-sm text-green-700 dark:text-green-300">
                You're improving! This week's accuracy is {analytics.weeklyAccuracy - analytics.overallAccuracy}% higher!
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
