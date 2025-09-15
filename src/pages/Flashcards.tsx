// Import the Supabase client and React hooks.
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import FlashcardDisplay from '@/components/Flashcards/FlashcardDisplay';

// --- Interfaces for Data Models ---
interface Subject {
    id: string;
    name: string;
}

interface Chapter {
    id: string;
    name: string;
    chapter_number: number;
}

// --- Skeleton Loading Component ---
const SkeletonCard: React.FC = () => (
    <div className="bg-gray-200 animate-pulse rounded-lg p-6 shadow-md h-24 w-full"></div>
);

// --- Content Selection Component (Subjects & Chapters) ---
// This component now handles both subject and chapter displays dynamically.
interface ContentSelectionProps {
    data: Subject[] | Chapter[];
    loading: boolean;
    onSelect: (id: string) => void;
    title: string;
    type: 'subject' | 'chapter';
}

const ContentSelection: React.FC<ContentSelectionProps> = ({ data, loading, onSelect, title, type }) => {
    if (loading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center w-full">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">{title}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                {data.length === 0 ? (
                    <p className="col-span-full text-center text-gray-500">
                        No {type}s found.
                    </p>
                ) : (
                    data.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => onSelect(item.id)}
                            className="group bg-white rounded-xl p-6 shadow-lg hover:shadow-2xl transition-all duration-300 ease-in-out transform hover:-translate-y-2 focus:outline-none focus:ring-4 focus:ring-purple-500/50"
                        >
                            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-purple-600 transition-colors duration-200">
                                {type === 'chapter' ? `${(item as Chapter).chapter_number}. ${item.name}` : item.name}
                            </h3>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
};

// --- Flashcards Main Page Component ---
const Flashcards: React.FC = () => {
    const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
    const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [displayMode, setDisplayMode] = useState<'subjects' | 'chapters'>('subjects');

    // Fetch subjects on initial component mount
    useEffect(() => {
        const fetchSubjects = async () => {
            setLoading(true);
            setErrorMessage(null);
            try {
                const { data, error } = await supabase.from('subjects').select('id, name').order('name', { ascending: true });
                if (error) throw error;
                setSubjects(data || []);
            } catch (error: any) {
                console.error('Error fetching subjects:', error.message);
                setErrorMessage(`Error fetching subjects: ${error.message}`);
            } finally {
                setLoading(false);
            }
        };
        fetchSubjects();
    }, []);

    // Fetch chapters when a subject is selected
    useEffect(() => {
        const fetchChapters = async () => {
            if (!selectedSubjectId) {
                setChapters([]);
                return;
            }
            setLoading(true);
            setErrorMessage(null);
            try {
                const { data, error } = await supabase
                    .from('chapters')
                    .select('id, name, chapter_number')
                    .eq('subject_id', selectedSubjectId)
                    .order('chapter_number', { ascending: true });

                if (error) throw error;
                setChapters(data || []);
            } catch (error: any) {
                console.error('Error fetching chapters:', error.message);
                setErrorMessage(`Error fetching chapters: ${error.message}`);
                setChapters([]);
            } finally {
                setLoading(false);
            }
        };

        if (displayMode === 'chapters') {
            fetchChapters();
        }
    }, [selectedSubjectId, displayMode]);

    // Handlers for selection
    const handleSubjectSelect = (subjectId: string) => {
        setSelectedSubjectId(subjectId);
        setSelectedChapterId(null);
        setDisplayMode('chapters');
    };

    const handleChapterSelect = (chapterId: string) => {
        setSelectedChapterId(chapterId);
    };

    const getSelectedChapterName = () => {
        const chapter = chapters.find((c) => c.id === selectedChapterId);
        return chapter ? `Chapter ${chapter.chapter_number}: ${chapter.name}` : 'N/A';
    };

    const getSelectedSubjectName = () => {
        const subject = subjects.find((s) => s.id === selectedSubjectId);
        return subject ? subject.name : 'N/A';
    };

    return (
        <div className="flex flex-col flex-1 p-8 bg-gray-50 min-h-screen font-sans antialiased">
            <header className="mb-12 p-6 bg-white rounded-xl shadow-xl border border-gray-100 flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-50 to-indigo-50 opacity-50 z-0"></div>
                <div className="flex items-center gap-4 z-10">
                    <img
                        src="/lovable-uploads/bf69a7f7-550a-45a1-8808-a02fb889f8c5.png"
                        alt="Flashcards Logo"
                        className="w-16 h-16 sm:w-20 sm:h-20"
                    />
                    <h1 className="text-4xl sm:text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-indigo-500 drop-shadow-md">
                        Flashcards
                    </h1>
                </div>
            </header>

            <main className="flex-1 flex flex-col items-center w-full">
                {/* Flashcards display at the top when a chapter is selected */}
                {selectedChapterId && (
                    <div className="mb-12 w-full max-w-4xl">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-2xl font-bold text-gray-700">
                                {getSelectedSubjectName()} - {getSelectedChapterName()}
                            </h2>
                            <button
                                onClick={() => setSelectedChapterId(null)}
                                className="text-sm text-purple-600 hover:text-purple-800 transition-colors duration-200"
                            >
                                Change Chapter
                            </button>
                        </div>
                        <FlashcardDisplay chapterId={selectedChapterId} />
                    </div>
                )}

                {/* Subject/Chapter selection section */}
                {!selectedChapterId && (
                    <div className="w-full max-w-4xl bg-white p-8 rounded-xl shadow-2xl border border-gray-200 transition-all duration-500 ease-in-out transform">
                        <div className="flex justify-center mb-6">
                            {displayMode === 'chapters' && (
                                <button
                                    onClick={() => setDisplayMode('subjects')}
                                    className="flex items-center text-purple-600 hover:text-purple-800 transition-colors duration-200 mb-4"
                                >
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
                                    Back to Subjects
                                </button>
                            )}
                        </div>
                        {displayMode === 'subjects' ? (
                            <ContentSelection
                                data={subjects}
                                loading={loading}
                                onSelect={handleSubjectSelect}
                                title="Choose a Subject"
                                type="subject"
                            />
                        ) : (
                            <ContentSelection
                                data={chapters}
                                loading={loading}
                                onSelect={handleChapterSelect}
                                title="Choose a Chapter"
                                type="chapter"
                            />
                        )}
                        {errorMessage && (
                            <div className="mt-6 text-center text-red-600 bg-red-50 p-4 rounded-md border border-red-200">
                                <p>{errorMessage}</p>
                            </div>
                        )}
                    </div>
                )}
            </main>

            <footer className="mt-16 p-6 text-center text-gray-500 text-sm border-t border-gray-200">
                &copy; {new Date().getFullYear()} Medistics.App. All rights reserved.
            </footer>
        </div>
    );
};

export default Flashcards;