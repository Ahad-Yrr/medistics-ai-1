// BattleRoom.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, Swords, XCircle, Gamepad2, Hourglass, Copy, BookOpenText, Play, Bell } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { ProfileDropdown } from '@/components/ProfileDropdown';
import { Input } from '@/components/ui/input';

interface BattleRoomProps {
  roomId: string;
  userId: string; // The ID of the current logged-in user
  onLeave: () => void;
  onBattleStart: (roomData: RoomData) => void; // MODIFIED: now passes roomData
}

// Defines the structure of the room data, including participants, as fetched from Supabase.
interface RoomData {
  id: string;
  room_code: string;
  battle_type: '1v1' | '2v2' | 'ffa'; // Explicitly define battle types
  max_players: number;
  status: 'waiting' | 'in_progress' | 'completed';
  time_per_question: number;
  total_questions: number;
  subject: string;
  host_id: string;
  host_ping_requested_at: string | null; // Timestamp for host ping request
  last_ping_sender_id: string | null; // ID of the last user who pinged
  last_ping_sender_username: string | null; // Username of the last user who pinged
  countdown_initiated_at: string | null; // New: Timestamp when countdown was initiated
  created_at: string;
  battle_participants: { id: string; user_id: string; username: string; created_at: string; }[]; // Added created_at for sorting
}

export const BattleRoom = ({ roomId, userId, onLeave, onBattleStart }: BattleRoomProps) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isLeaving, setIsLeaving] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevHostPingRequestedAt = useRef<string | null>(null);
  const prevHostPingSenderId = useRef<string | null>(null);
  const [showConfirmLeaveModal, setShowConfirmLeaveModal] = useState(false);

  const prevParticipantsCount = useRef<number | null>(null);

  // --- Fetch room details and participants in real-time ---
  const { data: room, isLoading: roomLoading, error: roomError } = useQuery({
    queryKey: ['battleRoom', roomId],
    queryFn: async (): Promise<RoomData> => {
      console.log('useQuery: Fetching battle room for roomId:', roomId);
      const { data, error } = await supabase
        .from('battle_rooms')
        .select(`
          *,
          host_id,
          host_ping_requested_at,
          last_ping_sender_id,
          last_ping_sender_username,
          countdown_initiated_at,
          battle_participants(id, user_id, username, created_at)
        `)
        .eq('id', roomId)
        .single();

      if (error) {
        console.error("Supabase Error fetching battle room in queryFn:", error);
        throw error;
      }
      console.log('useQuery: Successfully fetched room data:', data);
      return data as RoomData;
    },
    refetchInterval: 3000,
    enabled: !!roomId,
  });

  // --- Real-time subscription for participants and room status ---
  useEffect(() => {
    if (!roomId) {
      console.log('Realtime Subscriptions: roomId is null, skipping subscriptions.');
      return;
    }

    console.log('Realtime Subscriptions: Setting up channels for roomId:', roomId);

    const participantChannel = supabase
      .channel(`battle_room_${roomId}_participants`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'battle_participants',
          filter: `battle_room_id=eq.${roomId}`
        },
        (payload) => {
          console.log('Realtime participant change detected:', payload);
          queryClient.invalidateQueries({ queryKey: ['battleRoom', roomId] });
        }
      )
      .subscribe();

    const roomStatusChannel = supabase
      .channel(`battle_room_${roomId}_status`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'battle_rooms',
          filter: `id=eq.${roomId}`
        },
        (payload) => {
          console.log('Realtime room status change detected:', payload);
          queryClient.invalidateQueries({ queryKey: ['battleRoom', roomId] });
          const updatedRoom = payload.new as RoomData;
          if (updatedRoom.status === 'in_progress') {
            console.log("Realtime: Room status changed to 'in_progress'. Starting battle...");
            if (countdownTimerRef.current) {
              clearInterval(countdownTimerRef.current);
              countdownTimerRef.current = null;
              console.log('Realtime: Cleared countdown timer due to status change.');
            }
            onBattleStart(updatedRoom);
          } else if (updatedRoom.status === 'completed') {
            console.log("Realtime: Room status changed to 'completed'. Leaving room.");
            onLeave();
            toast({
              title: "Room Closed",
              description: "This battle room has been closed.",
              variant: "destructive",
            });
          }
        }
      )
      .subscribe();

    console.log('Realtime Subscriptions: Channels subscribed.');

    return () => {
      console.log('Realtime Subscriptions: Cleaning up channels.');
      supabase.removeChannel(participantChannel);
      supabase.removeChannel(roomStatusChannel);
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        console.log('Realtime Subscriptions: Cleared countdown timer on unmount/cleanup.');
      }
    };
  }, [roomId, queryClient, onBattleStart, onLeave, toast]);

  // --- Effect to manage countdown when room is full or manually started ---
  useEffect(() => {
    console.log('Countdown Effect: Re-evaluating. Current room state:', room?.status, 'countdown_initiated_at:', room?.countdown_initiated_at);
    
    if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        console.log('Countdown Effect: Cleared existing interval.');
    }

    if (!room || room.status === 'in_progress') {
        console.log('Countdown Effect: No room data or room is in progress. Setting countdown to null and returning.');
        setCountdown(null);
        return;
    }

    const currentPlayers = room.battle_participants?.length || 0;
    const isRoomFull = currentPlayers === room.max_players;
    const isWaitingStatus = room.status === 'waiting';
    const isCountdownInitiatedByDB = room.countdown_initiated_at !== null;

    console.log('Countdown Effect: Conditions - isWaitingStatus:', isWaitingStatus, 'isRoomFull:', isRoomFull, 'isCountdownInitiatedByDB:', isCountdownInitiatedByDB);

    if (isWaitingStatus && (isRoomFull || isCountdownInitiatedByDB)) {
      const initialCountdownDuration = room.battle_type === '1v1' ? 5 : 10;
      let calculatedTimeRemaining = initialCountdownDuration;

      if (isCountdownInitiatedByDB && room.countdown_initiated_at) {
        const timeElapsed = (new Date().getTime() - new Date(room.countdown_initiated_at).getTime()) / 1000;
        calculatedTimeRemaining = Math.max(0, initialCountdownDuration - Math.floor(timeElapsed));
        console.log('Countdown Effect: Time elapsed:', timeElapsed, 'Calculated time remaining:', calculatedTimeRemaining);
      }

      if (countdown === null || countdown !== calculatedTimeRemaining) {
        setCountdown(calculatedTimeRemaining);
        console.log('Countdown Effect: Initial countdown set to:', calculatedTimeRemaining);
      }
      
      if (calculatedTimeRemaining <= 0) {
        console.log('Countdown Effect: Calculated time remaining is <= 0. Attempting to start battle directly.');
        if (room.status === 'waiting') {
            const updateStatus = async () => {
              console.log('Countdown Effect: Calling updateStatus to set room in_progress (time expired).');
              const { error } = await supabase
                .from('battle_rooms')
                .update({ status: 'in_progress', countdown_initiated_at: null })
                .eq('id', roomId);
              if (error) {
                console.error('Error updating room status to in_progress (time expired):', error);
                toast({
                  title: "Error",
                  description: "Failed to start battle automatically.",
                  variant: "destructive",
                });
              } else {
                console.log('Countdown Effect: Database update success (time expired). Invalidating queries.');
                queryClient.invalidateQueries({ queryKey: ['battleRoom', roomId] });
              }
            };
            updateStatus();
        }
        return;
      }

      if (calculatedTimeRemaining > 0 && countdownTimerRef.current === null) {
        console.log('Countdown Effect: Starting new interval for countdown. Initial value:', calculatedTimeRemaining);
        countdownTimerRef.current = setInterval(() => {
          setCountdown(prev => {
            if (prev === null) {
              if (countdownTimerRef.current) {
                clearInterval(countdownTimerRef.current);
                countdownTimerRef.current = null;
                console.log('Countdown Interval: prev is null, cleared interval.');
              }
              return null;
            }
  
            const currentRoomState = queryClient.getQueryData(['battleRoom', roomId]) as RoomData | undefined;
            console.log('Countdown Interval: Tick. prev:', prev, 'Current cached room status:', currentRoomState?.status);
  
            if (currentRoomState?.status === 'in_progress') {
              console.log('Countdown Interval: Cached room status is in_progress. Clearing interval.');
              if (countdownTimerRef.current) {
                clearInterval(countdownTimerRef.current);
                countdownTimerRef.current = null;
              }
              return null;
            }
  
            if (prev <= 1) {
              console.log('Countdown Interval: Reached 0 or 1. Attempting status update.');
              if (countdownTimerRef.current) {
                clearInterval(countdownTimerRef.current);
                countdownTimerRef.current = null;
              }
              if (currentRoomState?.status === 'waiting') {
                  const updateStatus = async () => {
                    console.log('Countdown Interval: Calling updateStatus to set room in_progress (countdown end).');
                    const { error } = await supabase
                      .from('battle_rooms')
                      .update({ status: 'in_progress', countdown_initiated_at: null })
                      .eq('id', roomId);
                    if (error) {
                      console.error('Error updating room status to in_progress (countdown end):', error);
                      toast({
                        title: "Error",
                        description: "Failed to start battle automatically.",
                        variant: "destructive",
                      });
                    } else {
                      console.log('Countdown Interval: Database update success (countdown end). Invalidating queries.');
                      queryClient.invalidateQueries({ queryKey: ['battleRoom', roomId] });
                    }
                  };
                  updateStatus();
              }
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    } else {
      console.log('Countdown Effect: Conditions not met. Clearing interval and resetting countdown state.');
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      if (countdown !== null) {
        setCountdown(null);
      }
    }

    return () => {
      console.log('Countdown Effect Cleanup: Clearing interval on unmount/dependency change.');
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [room, roomId, toast, queryClient, countdown]);

  // --- Effect for Join/Leave Toast Notifications and Kicking Removed Players ---
  useEffect(() => {
    if (!room) return;

    const currentPlayers = room.battle_participants?.length || 0;
    const isHost = room.host_id === userId;

    if (prevParticipantsCount.current !== null && prevParticipantsCount.current !== currentPlayers) {
      const oldParticipants = (queryClient.getQueryData(['battleRoom', roomId]) as RoomData)?.battle_participants || [];

      if (currentPlayers > prevParticipantsCount.current) {
        const newlyJoined = room.battle_participants.find(p => !oldParticipants.some(op => op.user_id === p.user_id));
        if (newlyJoined) {
          toast({
            title: "Player Joined!",
            description: `${newlyJoined.username} has joined the room.`,
          });
        }
      } else if (currentPlayers < prevParticipantsCount.current) {
        const removed = oldParticipants.find(p => !room.battle_participants?.some(np => np.user_id === p.user_id));
        if (removed) {
          toast({
            title: "Player Left",
            description: `${removed.username} has left the room.`,
          });
        }
      }
    }
    prevParticipantsCount.current = currentPlayers;

    const currentUserIsParticipant = room.battle_participants?.some(
      (participant) => participant.user_id === userId
    );

    if (!currentUserIsParticipant && !isHost && !isLeaving) {
      toast({
        title: "Kicked from Room",
        description: "You have been removed from this battle room.",
        variant: "destructive",
      });
      onLeave();
    }
  }, [room, userId, onLeave, toast, queryClient, isLeaving]);

  // --- Effect for Host Ping Notification ---
  useEffect(() => {
    if (!room || room.host_id !== userId) return;

    if (room.host_ping_requested_at &&
        (room.host_ping_requested_at !== prevHostPingRequestedAt.current ||
         room.last_ping_sender_id !== prevHostPingSenderId.current)) {
      const senderName = room.last_ping_sender_username || "A participant";
      toast({
        title: "Ping Received!",
        description: `${senderName} wants to start the battle!`,
        duration: 3000,
      });
    }
    prevHostPingRequestedAt.current = room.host_ping_requested_at;
    prevHostPingSenderId.current = room.last_ping_sender_id;
  }, [room, userId, toast]);

  // --- Leave Room Mutation ---
  const leaveRoomMutation = useMutation({
    mutationFn: async () => {
      setIsLeaving(true);
      const { error } = await supabase
        .from('battle_participants')
        .delete()
        .eq('battle_room_id', roomId)
        .eq('user_id', userId);

      if (error) {
        console.error("Supabase Error leaving room:", error);
        throw error;
      }
    },
    onSuccess: async () => {
      if (room && room.host_id === userId) {
        const remainingParticipants = room.battle_participants?.filter(p => p.user_id !== userId);

        if (remainingParticipants && remainingParticipants.length > 0) {
          const newHost = remainingParticipants.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
          console.log(`Host ${room.host_id} left. New host is ${newHost.user_id}`);

          const { error: updateHostError } = await supabase
            .from('battle_rooms')
            .update({ host_id: newHost.user_id })
            .eq('id', roomId);

          if (updateHostError) {
            console.error('Error updating new host:', updateHostError);
            toast({
              title: "Host Transfer Failed",
              description: "Could not transfer host privileges.",
              variant: "destructive"
            });
          } else {
            toast({
              title: "Host Changed",
              description: `${newHost.username} is now the host.`,
            });
          }
        } else {
          console.log("Host left, no remaining participants to transfer host to.");
        }
      }

      toast({ title: "Left Room", description: "You have left the battle room." });

      const updatedRoom = queryClient.getQueryData(['battleRoom', roomId]) as RoomData;
      if (updatedRoom && updatedRoom.status === 'in_progress' && (updatedRoom.battle_participants?.length || 0) <= updatedRoom.max_players) {
        const newParticipantCount = (updatedRoom.battle_participants?.length || 0) - 1;
        if (newParticipantCount < updatedRoom.max_players) {
          const { error: statusUpdateError } = await supabase
            .from('battle_rooms')
            .update({ status: 'waiting', countdown_initiated_at: null })
            .eq('id', roomId);
          if (statusUpdateError) {
            console.error("Error reverting room status to waiting:", statusUpdateError);
          }
        }
      }
      onLeave();
    },
    onError: (error: any) => {
      console.error('Error leaving room:', error);
      toast({
        title: "Error",
        description: `Failed to leave room: ${error.message}`,
        variant: "destructive"
      });
      setIsLeaving(false);
    }
  });

  // --- Remove Participant Mutation ---
  const removeParticipantMutation = useMutation({
    mutationFn: async (participantUserId: string) => {
      if (!room || room.host_id !== userId) {
        throw new Error("Only the host can remove participants.");
      }
      if (participantUserId === userId) {
        throw new Error("You cannot remove yourself.");
      }

      const { error } = await supabase
        .from('battle_participants')
        .delete()
        .eq('battle_room_id', roomId)
        .eq('user_id', participantUserId);

      if (error) {
        console.error("Supabase Error removing participant:", error);
        throw error;
      }
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['battleRoom', roomId] });
      toast({ title: "Participant Removed", description: "A participant has been removed from the room." });

      const updatedRoom = queryClient.getQueryData(['battleRoom', roomId]) as RoomData;
      if (updatedRoom && updatedRoom.status === 'in_progress' && (updatedRoom.battle_participants?.length || 0) <= updatedRoom.max_players) {
        const newParticipantCount = (updatedRoom.battle_participants?.length || 0) - 1;
        if (newParticipantCount < updatedRoom.max_players) {
          const { error: statusUpdateError } = await supabase
            .from('battle_rooms')
            .update({ status: 'waiting', countdown_initiated_at: null })
            .eq('id', roomId);
          if (statusUpdateError) {
            console.error("Error reverting room status to waiting:", statusUpdateError);
          }
        }
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Failed to remove participant: ${error.message}`,
        variant: "destructive"
      });
    }
  });

  // Mutation for host to manually start the battle (FFA only)
  const startBattleMutation = useMutation({
    mutationFn: async () => {
      if (!room || room.host_id !== userId) {
        throw new Error("Only the host can start the battle.");
      }
      if (room.battle_type !== 'ffa') {
        throw new Error("Only FFA battles can be started manually by the host.");
      }
      if (room.status !== 'waiting') {
        throw new Error("Battle can only be started from 'waiting' status.");
      }

      console.log('startBattleMutation: Initiating countdown by updating countdown_initiated_at.');
      const { error } = await supabase
        .from('battle_rooms')
        .update({
          countdown_initiated_at: new Date().toISOString(),
          host_ping_requested_at: null,
          last_ping_sender_id: null,
          last_ping_sender_username: null,
        })
        .eq('id', roomId);

      if (error) {
        console.error("Supabase Error initiating countdown manually:", error);
        throw error;
      }
    },
    onSuccess: () => {
      console.log('startBattleMutation: Countdown initiated successfully.');
      toast({
        title: "Starting Battle!",
        description: "The host has initiated the battle countdown.",
      });
    },
    onError: (error: any) => {
      console.error('startBattleMutation onError:', error);
      toast({
        title: "Error Starting Battle",
        description: `Failed to start battle: ${error.message}`,
        variant: "destructive"
      });
    }
  });

  // New: Mutation for participants to ping the host
  const pingHostMutation = useMutation({
    mutationFn: async () => {
      if (!room || room.host_id === userId) {
        throw new Error("Invalid action: cannot ping host or not in a room.");
      }
      if (room.battle_type !== 'ffa') {
        throw new Error("Pinging host is only available in FFA mode.");
      }
      if (room.status !== 'waiting') {
        throw new Error("Cannot ping host once battle has started.");
      }

      const senderUsername = room.battle_participants.find(p => p.user_id === userId)?.username || 'A participant';

      console.log('pingHostMutation: Pinging host.');
      const { error } = await supabase
        .from('battle_rooms')
        .update({
          host_ping_requested_at: new Date().toISOString(),
          last_ping_sender_id: userId,
          last_ping_sender_username: senderUsername
        })
        .eq('id', roomId);

      if (error) {
        console.error("Supabase Error pinging host:", error);
        throw error;
      }
    },
    onSuccess: () => {
      console.log('pingHostMutation: Ping sent successfully.');
      toast({
        title: "Ping Sent!",
        description: "Host has been notified to start the battle.",
      });
    },
    onError: (error: any) => {
      console.error('pingHostMutation onError:', error);
      toast({
        title: "Error Pinging Host",
        description: `Failed to send ping: ${error.message}`,
        variant: "destructive"
      });
    }
  });

  // Function to copy room code to clipboard
  const handleCopyRoomCode = () => {
    if (room?.room_code) {
      try {
        const tempInput = document.createElement('input');
        tempInput.value = room.room_code;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        toast({
          title: "Copied!",
          description: "Room code copied to clipboard.",
        });
      } catch (err) {
        console.error('Failed to copy room code:', err);
        toast({
          title: "Copy Failed",
          description: "Could not copy room code. Please try manually.",
          variant: "destructive",
        });
      }
    }
  };

  const handleLeaveClick = () => {
    const isHost = room?.host_id === userId;
    if (isHost) {
      setShowConfirmLeaveModal(true);
    } else {
      leaveRoomMutation.mutate();
    }
  };

  const confirmLeave = () => {
    setShowConfirmLeaveModal(false);
    leaveRoomMutation.mutate();
  };

  const cancelLeave = () => {
    setShowConfirmLeaveModal(false);
  };

  // --- Render logic for loading, error, and main waiting room UI ---
  if (roomLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 dark:from-red-900/20 dark:via-orange-900/20 dark:to-yellow-900/20 p-4">
        <Loader2 className="h-8 w-8 animate-spin text-red-600" />
        <p className="ml-3 text-lg text-gray-700 dark:text-gray-300">Loading room details...</p>
      </div>
    );
  }

  if (roomError || !room) {
    console.error('Render Error: Room data not available or error occurred:', roomError);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 dark:from-red-900/20 dark:via-orange-900/20 dark:to-yellow-900/20 p-4 text-center">
        <XCircle className="h-16 w-16 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">Error Loading Room</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-2">{roomError?.message || "Room not found or accessible. Check RLS policies."}</p>
        <Button onClick={onLeave} className="mt-6 bg-red-600 hover:bg-red-700 text-white">
          Back to Lobby
        </Button>
      </div>
    );
  }

  const currentPlayers = room.battle_participants?.length || 0;
  const isRoomFull = currentPlayers === room.max_players;
  const isGameStarting = room.status === 'in_progress';
  const isHost = room.host_id === userId;
  const isCountdownInitiated = room.countdown_initiated_at !== null;


  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 dark:from-red-900/20 dark:via-orange-900/20 dark:to-yellow-900/20 p-4 flex flex-col items-center justify-center">
      <Card className="w-full max-w-2xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-red-200 dark:border-red-800 shadow-xl">
        <CardHeader className="text-center p-6 pb-4">
          <CardTitle className="text-3xl font-bold text-gray-900 dark:text-white flex items-center justify-center space-x-3">
            <Gamepad2 className="w-8 h-8 text-red-600 dark:text-red-400" />
            <span>Battle Room</span>
          </CardTitle>
          <CardDescription className="text-md text-gray-600 dark:text-gray-300 mt-2">
            Waiting for players to join...
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-2 space-y-6">
          {/* Room Code Display with Copy Button */}
          <div className="flex flex-col items-center space-y-2 mt-4">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Room Code:</p>
            <div className="flex items-center space-x-2">
              <Input
                type="text"
                readOnly
                value={room.room_code}
                className="w-32 md:w-40 text-center font-mono text-xl tracking-wider select-text"
              />
              <Button onClick={handleCopyRoomCode} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white">
                <Copy className="w-4 h-4 mr-2" /> Copy
              </Button>
            </div>
          </div>

          {/* Room statistics: Players, Type, Settings, Subject */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-start text-center mt-6">
            <div>
              <Users className="w-6 h-6 mx-auto mb-1 text-red-600 dark:text-red-400" />
              <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">{currentPlayers} / {room.max_players}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Players Joined</p>
            </div>
            <div>
              <Swords className="w-6 h-6 mx-auto mb-1 text-red-600 dark:text-red-400" />
              <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">{room.battle_type}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Battle Type</p>
            </div>
            <div>
              <Hourglass className="w-6 h-6 mx-auto mb-1 text-red-600 dark:text-red-400" />
              <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">{room.total_questions} Qs / {room.time_per_question}s</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Settings</p>
            </div>
            {/* Display Subject with a proper icon */}
            {room.subject && (
              <div>
                <BookOpenText className="w-6 h-6 mx-auto mb-1 text-red-600 dark:text-red-400" />
                <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">{room.subject}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Subject</p>
              </div>
            )}
          </div>

          {/* List of current players in the room */}
          <div className="space-y-3">
            <h3 className="font-medium text-gray-900 dark:text-white">Current Players:</h3>
            <div className="flex flex-col space-y-2">
              {room.battle_participants?.map((participant) => (
                <Badge
                  key={participant.id}
                  variant="secondary"
                  className="w-full flex items-center justify-start p-3 text-md border border-gray-200 dark:border-gray-700 rounded-md shadow-sm"
                >
                  <Users className="w-4 h-4 mr-2" />
                  <span>{participant.username}</span>
                  {/* Conditional labels for host and current user */}
                  {participant.user_id === userId && room.host_id === participant.user_id && <span className="ml-1 font-bold text-red-700 dark:text-red-300">(You, Host)</span>}
                  {participant.user_id === userId && room.host_id !== participant.user_id && <span className="ml-1 text-purple-600 dark:text-purple-400">(You)</span>}
                  {room.host_id === participant.user_id && participant.user_id !== userId && <span className="ml-1 font-bold text-blue-600 dark:text-blue-400">(Host)</span>}

                  {/* Host can remove other participants */}
                  {isHost && participant.user_id !== userId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto p-1 h-auto text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200"
                      onClick={() => removeParticipantMutation.mutate(participant.user_id)}
                      disabled={removeParticipantMutation.isPending}
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  )}
                  {/* New: Ping Host Button for non-host participants in FFA mode */}
                  {!isHost && participant.user_id === room.host_id && room.battle_type === 'ffa' && room.status === 'waiting' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto p-1 h-auto text-yellow-500 hover:text-yellow-700 dark:text-yellow-400 dark:hover:text-yellow-200"
                      onClick={() => pingHostMutation.mutate()}
                      disabled={pingHostMutation.isPending}
                    >
                      <Bell className="w-4 h-4" />
                    </Button>
                  )}
                </Badge>
              ))}
            </div>
          </div>

          {/* Messages based on room status and countdown */}
          {countdown !== null && room.status === 'waiting' && countdown > 0 ? (
            <div className="text-center text-lg font-semibold text-green-600 dark:text-green-400 animate-pulse">
              Battle starting in {countdown} seconds!
            </div>
          ) : isGameStarting ? (
            <div className="text-center text-lg font-semibold text-green-600 dark:text-green-400 animate-pulse">
              All players joined! Battle starting soon...
            </div>
          ) : room.status === 'waiting' ? (
            <div className="text-center text-gray-700 dark:text-gray-300">
              Waiting for players to join...
            </div>
          ) : null}

          {/* Host Start Battle Button (FFA only) */}
          {isHost && room.battle_type === 'ffa' && room.status === 'waiting' && currentPlayers > 1 && !isCountdownInitiated && (
            <Button
              onClick={() => startBattleMutation.mutate()}
              disabled={startBattleMutation.isPending || currentPlayers < 2}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center space-x-2"
            >
              {startBattleMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span>Start Battle Now! (FFA)</span>
            </Button>
          )}

          {/* Leave Button */}
          <Button
            onClick={handleLeaveClick}
            disabled={leaveRoomMutation.isPending}
            variant="outline"
            className="w-full border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
          >
            {isLeaving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <XCircle className="w-4 h-4 mr-2" />
            )}
            Leave Room
          </Button>
        </CardContent>
      </Card>

      {/* Custom Confirmation Modal */}
      {showConfirmLeaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm p-6 text-center shadow-lg bg-white dark:bg-gray-800">
            <CardTitle className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Confirm Leave</CardTitle>
            <CardDescription className="text-gray-700 dark:text-gray-300 mb-6">
              As the host, if you leave, a new host will be assigned. Are you sure you want to leave this battle room?
            </CardDescription>
            <div className="flex justify-center space-x-4">
              <Button
                variant="destructive"
                onClick={confirmLeave}
                disabled={leaveRoomMutation.isPending}
                className="px-6 py-2"
              >
                {leaveRoomMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  "Yes, Leave"
                )}
              </Button>
              <Button
                variant="outline"
                onClick={cancelLeave}
                className="px-6 py-2 border-gray-300 dark:border-gray-600"
              >
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
