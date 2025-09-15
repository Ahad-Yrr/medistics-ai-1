import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Flashcard {
    id: string;
    sentence: string;
    important_ph: string | null;
    topic: string | null;
}

interface FlashcardDisplayProps {
    chapterId: string;
}

const IMPORTANT_PH_COLORS = [
    'from-purple-500 to-indigo-500',
    'from-pink-500 to-purple-500',
    'from-blue-500 to-purple-500',
    'from-indigo-500 to-blue-500',
    'from-rose-500 to-pink-500',
];

// Escape RegExp special chars in important_ph so split() works reliably
const escapeForRegExp = (text: string) =>
    text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const FlashcardDisplay: React.FC<FlashcardDisplayProps> = ({ chapterId }) => {
    const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
    const [showAnswer, setShowAnswer] = useState(false);
    const [currentPhColorIndex, setCurrentPhColorIndex] = useState(0);

    useEffect(() => {
        const fetchFlashcards = async () => {
            setLoading(true);
            setError(null);
            setFlashcards([]);
            setCurrentFlashcardIndex(0);
            setShowAnswer(false);

            if (!chapterId) {
                setLoading(false);
                return;
            }

            try {
                const { data, error } = await supabase
                    .from('flashcards')
                    .select('id, sentence, important_ph, topic')
                    .eq('chapter_id', chapterId);

                if (error) throw error;
                setFlashcards(data || []);
            } catch (err: any) {
                console.error('Error fetching flashcards:', err.message);
                setError(`Failed to load flashcards: ${err.message}`);
            } finally {
                setLoading(false);
            }
        };

        fetchFlashcards();
    }, [chapterId]);

    // Auto-reveal answer after delay on each card
    useEffect(() => {
        if (!loading && flashcards.length > 0) {
            const timer = setTimeout(() => setShowAnswer(true), 700);
            return () => clearTimeout(timer);
        }
    }, [currentFlashcardIndex, loading, flashcards]);

    // Rotate gradient color each card
    useEffect(() => {
        if (flashcards.length > 0) {
            setCurrentPhColorIndex(
                (prevIndex) => (prevIndex + 1) % IMPORTANT_PH_COLORS.length
            );
        }
    }, [currentFlashcardIndex, flashcards.length]);

    const handleNext = () => {
        setShowAnswer(false);
        setTimeout(() => {
            setCurrentFlashcardIndex(
                (prevIndex) => (prevIndex + 1) % flashcards.length
            );
        }, 100);
    };

    const handlePrev = () => {
        setShowAnswer(false);
        setTimeout(() => {
            setCurrentFlashcardIndex(
                (prevIndex) => (prevIndex - 1 + flashcards.length) % flashcards.length
            );
        }, 100);
    };

    if (loading) {
        return (
            <div className="flex flex-col justify-center items-center h-40 bg-white rounded-lg shadow-lg p-6">
                <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-purple-500 mb-4"></div>
                <p className="text-lg text-gray-700">Loading flashcards...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-red-600 p-4 bg-red-100 rounded-md text-center border border-red-200 shadow-sm">
                {error}
            </div>
        );
    }

    if (flashcards.length === 0) {
        return (
            <div className="text-gray-600 p-6 text-center bg-white rounded-lg shadow-lg border border-gray-100">
                No flashcards found for this chapter.
            </div>
        );
    }

    const currentFlashcard = flashcards[currentFlashcardIndex];
    const currentPhGradient = IMPORTANT_PH_COLORS[currentPhColorIndex];

    const renderSentence = () => {
        if (!currentFlashcard.important_ph) {
            return (
                <span className="text-2xl font-bold text-gray-900 mb-4 px-4 leading-relaxed">
                    {currentFlashcard.sentence}
                </span>
            );
        }

        const needle = currentFlashcard.important_ph;
        const parts = currentFlashcard.sentence.split(
            new RegExp(`(${escapeForRegExp(needle)})`, 'i')
        );

        return (
            <span
                key={`${currentFlashcard.id}-${currentFlashcardIndex}`} // force remount so opacity re-triggers every card
                className="text-2xl font-bold text-gray-900 mb-4 px-4 leading-relaxed"
            >
                {parts.map((part, index) => {
                    if (part.toLowerCase() === needle.toLowerCase()) {
                        return (
                            <span
                                key={`hi-${index}`}
                                className={`bg-clip-text text-transparent bg-gradient-to-r ${currentPhGradient} transition-opacity duration-500`}
                                style={{ opacity: showAnswer ? 1 : 0 }}
                            >
                                {part}
                            </span>
                        );
                    }
                    return <span key={`pt-${index}`}>{part}</span>;
                })}
            </span>
        );
    };

    return (
        <div className="mt-8 relative z-10">
            <div className="relative bg-white p-8 rounded-xl shadow-2xl min-h-[250px] flex flex-col justify-between items-center text-center overflow-hidden transition-all duration-300 ease-in-out transform hover:scale-[1.01] border border-purple-100">
                <div className="relative z-10 flex flex-col items-center justify-center h-full w-full">
                    {renderSentence()}
                    {showAnswer && currentFlashcard.topic && (
                        <div className="border-t-2 border-purple-200 pt-6 mt-6 w-11/12 transition-opacity duration-500 opacity-100 animate-fadeInUp">
                            <p className="text-lg text-gray-600 mt-2">
                                <span className="font-bold">Topic:</span> {currentFlashcard.topic}
                            </p>
                        </div>
                    )}
                </div>

                {/* Continuous, edge-to-edge wave (two tiled paths; SVG-native animation for perfect looping) */}
                <div className="absolute bottom-0 left-0 w-full h-16 overflow-hidden">
                    <svg
                        className="w-full h-full"
                        viewBox="0 0 200 100"
                        preserveAspectRatio="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <defs>
                            <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#d8b4fe" />
                                <stop offset="50%" stopColor="#c084fc" />
                                <stop offset="100%" stopColor="#a78bfa" />
                            </linearGradient>
                        </defs>

                        {/* Group holds two identical waves, second shifted by +200 units (viewBox width). 
                The group slides left by -200 units and loops → seamless infinite scroll. */}
                        <g>
                            <g>
                                <path
                                    d="M0 50 Q 25 0, 50 50 T 100 50 T 150 50 T 200 50 V100 H0 Z"
                                    fill="url(#waveGradient)"
                                    opacity="0.5"
                                />
                                <path
                                    d="M0 50 Q 25 0, 50 50 T 100 50 T 150 50 T 200 50 V100 H0 Z"
                                    fill="url(#waveGradient)"
                                    opacity="0.5"
                                    transform="translate(200 0)"
                                />
                                <animateTransform
                                    attributeName="transform"
                                    type="translate"
                                    from="0 0"
                                    to="-200 0"
                                    dur="8s"
                                    repeatCount="indefinite"
                                />
                            </g>
                        </g>
                    </svg>
                </div>
            </div>

            <div className="flex justify-between items-center mt-8 px-4">
                <button
                    onClick={handlePrev}
                    disabled={flashcards.length <= 1}
                    className="px-8 py-3 bg-gradient-to-r from-gray-300 to-gray-400 text-gray-800 rounded-full font-semibold hover:from-gray-400 hover:to-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-md hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-gray-300/70"
                >
                    <svg
                        className="w-5 h-5 inline-block mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                    </svg>
                    Previous
                </button>
                <span className="text-xl font-bold text-gray-800">
                    {currentFlashcardIndex + 1} / {flashcards.length}
                </span>
                <button
                    onClick={handleNext}
                    disabled={flashcards.length <= 1}
                    className="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full font-semibold hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-md hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-purple-400/70"
                >
                    Next
                    <svg
                        className="w-5 h-5 inline-block ml-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
                    </svg>
                </button>
            </div>

            <style jsx>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeInUp {
          animation: fadeInUp 0.5s ease-out forwards;
        }
      `}</style>
        </div>
    );
};

export default FlashcardDisplay;
