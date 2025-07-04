import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom'; // Using react-router-dom based on your model
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, Users, Lock, Unlock, MessageSquare, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner'; // Assuming you have a toast notification library like sonner

const Classroom = () => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassDescription, setNewClassDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);

  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Get user profile data (similar to your AI page)
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('plan') // Only fetching plan for the badge
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }
      return data;
    },
    enabled: !!user?.id
  });

  // Get classrooms the user is a member of
  const { data: userClassrooms, isLoading: isLoadingUserClassrooms, error: userClassroomsError } = useQuery({
    queryKey: ['userClassrooms', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('classroom_members')
        .select(`
          classroom_id,
          role,
          classrooms (id, name, description, is_public, invite_code)
        `)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching user classrooms:', error);
        throw error;
      }
      return data.map(member => ({
        ...member.classrooms,
        member_role: member.role // Attach the user's role in this classroom
      }));
    },
    enabled: !!user?.id
  });

  // Get public classrooms
  const { data: publicClassrooms, isLoading: isLoadingPublicClassrooms, error: publicClassroomsError } = useQuery({
    queryKey: ['publicClassrooms'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classrooms')
        .select('*')
        .eq('is_public', true);

      if (error) {
        console.error('Error fetching public classrooms:', error);
        throw error;
      }
      return data;
    }
  });

  // Mutation for creating a new classroom
  const createClassroomMutation = useMutation({
    mutationFn: async ({ name, description, is_public }: { name: string; description: string; is_public: boolean }) => {
      if (!user?.id) throw new Error('User not authenticated.');

      const invite_code = is_public ? null : Math.random().toString(36).substring(2, 8).toUpperCase(); // Simple invite code for demonstration

      const { data: classroomData, error: classroomError } = await supabase
        .from('classrooms')
        .insert({
          name,
          description,
          is_public,
          host_id: user.id,
          invite_code
        })
        .select()
        .single();

      if (classroomError) throw classroomError;

      // Add the creator as a member with 'host' role
      const { error: memberError } = await supabase
        .from('classroom_members')
        .insert({
          user_id: user.id,
          classroom_id: classroomData.id,
          role: 'host'
        });

      if (memberError) throw memberError;

      return classroomData;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['userClassrooms'] });
      queryClient.invalidateQueries({ queryKey: ['publicClassrooms'] });
      toast.success('Classroom created successfully!');
      setIsCreateModalOpen(false);
      setNewClassName('');
      setNewClassDescription('');
      setIsPublic(true);
      if (!data.is_public && data.invite_code) {
        setGeneratedInviteLink(`${window.location.origin}/classroom/join/${data.invite_code}`);
      }
      navigate(`/classroom/${data.id}`); // Navigate to the newly created classroom chat
    },
    onError: (error) => {
      console.error('Error creating classroom:', error);
      toast.error(`Failed to create classroom: ${error.message}`);
    },
  });

  // Mutation for joining a public classroom
  const joinClassroomMutation = useMutation({
    mutationFn: async (classroom_id: string) => {
      if (!user?.id) throw new Error('User not authenticated.');

      const { error } = await supabase
        .from('classroom_members')
        .insert({
          user_id: user.id,
          classroom_id: classroom_id,
          role: 'member'
        });

      if (error) throw error;
      return true;
    },
    onSuccess: (data, classroom_id) => {
      queryClient.invalidateQueries({ queryKey: ['userClassrooms'] });
      toast.success('Joined classroom successfully!');
      navigate(`/classroom/${classroom_id}`); // Navigate to the joined classroom chat
    },
    onError: (error) => {
      console.error('Error joining classroom:', error);
      toast.error(`Failed to join classroom: ${error.message}`);
    },
  });

  const handleCreateClassroom = () => {
    if (!newClassName.trim()) {
      toast.error('Classroom name cannot be empty.');
      return;
    }
    createClassroomMutation.mutate({ name: newClassName, description: newClassDescription, is_public: isPublic });
  };

  // Plan color schemes (copied from your AI page)
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
    'default': { // Fallback for unknown plans
      light: 'bg-gray-100 text-gray-800 border-gray-300',
      dark: 'dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600'
    }
  };

  const rawUserPlan = profile?.plan?.toLowerCase() || 'free';
  const userPlanDisplayName = rawUserPlan.charAt(0).toUpperCase() + rawUserPlan.slice(1) + ' Plan';
  const currentPlanColorClasses = planColors[rawUserPlan] || planColors['default'];

  return (
    <div className="min-h-screen w-full bg-white dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-b border-purple-200 dark:border-purple-800 sticky top-0 z-50">
        <div className="container mx-auto px-4 lg:px-8 py-4 flex justify-between items-center max-w-7xl">
          <Link to="/dashboard" className="flex items-center space-x-2 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <div className="flex items-center space-x-3">
            <img src="/lovable-uploads/bf69a7f7-550a-45a1-8808-a02fb889f8c5.png" alt="Medistics Logo" className="w-8 h-8 object-contain" />
            <span className="text-xl font-bold text-gray-900 dark:text-white">Classroom</span>
          </div>

          <div className="flex items-center space-x-3">
            <Button variant="ghost" size="sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="w-9 h-9 p-0 hover:scale-110 transition-transform duration-200">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Badge
              variant="secondary"
              className={`${currentPlanColorClasses.light} ${currentPlanColorClasses.dark}`}
            >
              {userPlanDisplayName}
            </Badge>
            <div className="w-8 h-8 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-sm">
                {user?.email?.substring(0, 2).toUpperCase() || 'U'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 lg:px-8 py-8 max-w-7xl">
        {/* Hero Section */}
        <div className="text-center mb-8 animate-fade-in">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            📚 Your Classrooms
          </h1>
          <p className="text-lg md:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Create and join study groups to collaborate with peers.
          </p>
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="mt-6 bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" /> Create New Classroom
          </Button>
        </div>

        {/* User's Classrooms */}
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 mt-8">Your Groups</h2>
        {isLoadingUserClassrooms ? (
          <p className="text-gray-600 dark:text-gray-400">Loading your classrooms...</p>
        ) : userClassroomsError ? (
          <p className="text-red-500">Error loading your classrooms: {userClassroomsError.message}</p>
        ) : userClassrooms && userClassrooms.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {userClassrooms.map((classroom) => (
              <Card key={classroom.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow duration-300 animate-fade-in">
                <CardHeader>
                  <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                    {classroom.is_public ? <Unlock className="w-5 h-5 text-green-500" /> : <Lock className="w-5 h-5 text-red-500" />}
                    {classroom.name}
                  </CardTitle>
                  <CardDescription className="text-gray-600 dark:text-gray-400">
                    {classroom.description || 'No description provided.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex justify-between items-center">
                  <Badge variant="outline" className="text-sm">
                    {classroom.member_role === 'host' ? 'Host' : 'Member'}
                  </Badge>
                  <Link to={`/classroom/${classroom.id}`}>
                    <Button variant="default" className="bg-blue-600 hover:bg-blue-700 text-white">
                      Go to Chat <MessageSquare className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-gray-600 dark:text-gray-400">You haven't joined or created any classrooms yet.</p>
        )}

        {/* Public Classrooms to Join */}
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 mt-8">Discover Public Groups</h2>
        {isLoadingPublicClassrooms ? (
          <p className="text-gray-600 dark:text-gray-400">Loading public classrooms...</p>
        ) : publicClassroomsError ? (
          <p className="text-red-500">Error loading public classrooms: {publicClassroomsError.message}</p>
        ) : publicClassrooms && publicClassrooms.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {publicClassrooms
              .filter(pubClassroom => !userClassrooms?.some(uc => uc.id === pubClassroom.id)) // Filter out already joined classrooms
              .map((classroom) => (
                <Card key={classroom.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow duration-300 animate-fade-in">
                  <CardHeader>
                    <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                      <Unlock className="w-5 h-5 text-green-500" />
                      {classroom.name}
                    </CardTitle>
                    <CardDescription className="text-gray-600 dark:text-gray-400">
                      {classroom.description || 'No description provided.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      onClick={() => joinClassroomMutation.mutate(classroom.id)}
                      disabled={joinClassroomMutation.isPending}
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                    >
                      {joinClassroomMutation.isPending ? 'Joining...' : 'Join Group'}
                      <Users className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
          </div>
        ) : (
          <p className="text-gray-600 dark:text-gray-400">No public classrooms available to join.</p>
        )}

        {/* Create Classroom Modal */}
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogContent className="sm:max-w-[425px] dark:bg-gray-800 dark:text-white">
            <DialogHeader>
              <DialogTitle className="text-gray-900 dark:text-white">Create New Classroom</DialogTitle>
              <DialogDescription className="text-gray-600 dark:text-gray-400">
                Set up your new study group.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right text-gray-900 dark:text-white">
                  Name
                </Label>
                <Input
                  id="name"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  className="col-span-3 dark:bg-gray-700 dark:text-white dark:border-gray-600"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="description" className="text-right text-gray-900 dark:text-white">
                  Description
                </Label>
                <Textarea
                  id="description"
                  value={newClassDescription}
                  onChange={(e) => setNewClassDescription(e.target.value)}
                  className="col-span-3 dark:bg-gray-700 dark:text-white dark:border-gray-600"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="public" className="text-right text-gray-900 dark:text-white">
                  Public Group
                </Label>
                <Switch
                  id="public"
                  checked={isPublic}
                  onCheckedChange={setIsPublic}
                  className="col-span-3"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleCreateClassroom}
                disabled={createClassroomMutation.isPending || !newClassName.trim()}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {createClassroomMutation.isPending ? 'Creating...' : 'Create Classroom'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Invite Link Display Modal */}
        <Dialog open={!!generatedInviteLink} onOpenChange={() => setGeneratedInviteLink(null)}>
          <DialogContent className="sm:max-w-[425px] dark:bg-gray-800 dark:text-white">
            <DialogHeader>
              <DialogTitle className="text-gray-900 dark:text-white">Private Classroom Created!</DialogTitle>
              <DialogDescription className="text-gray-600 dark:text-gray-400">
                Share this link to invite others to your private classroom.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="invite-link" className="text-gray-900 dark:text-white">
                  Invite Link
                </Label>
                <Input
                  id="invite-link"
                  value={generatedInviteLink || ''}
                  readOnly
                  className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
                />
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedInviteLink || '');
                    toast.info('Invite link copied to clipboard!');
                  }}
                  variant="outline"
                  className="mt-2"
                >
                  Copy Link
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setGeneratedInviteLink(null)} className="bg-purple-600 hover:bg-purple-700 text-white">
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
};

export default Classroom;