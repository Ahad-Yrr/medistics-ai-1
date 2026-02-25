import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/toaster';
import Index from '@/pages/Index';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import Dashboard from '@/pages/Dashboard';
import MCQs from '@/pages/MCQs';
import Battle from '@/pages/Battle';
import AI from '@/pages/AI';
// import StudyMaterials from '@/pages/StudyMaterials';
import AITestGeneratorPage from '@/pages/AITestGenerator';
import AIChatbotPage from '@/pages/AIChatbot';
import Leaderboard from '@/pages/Leaderboard';
// import Admin15 from '@/pages/Admin15';
import Profile from '@/pages/Profile';
import Pricing from '@/pages/Pricing';
import TermsAndConditions from '@/pages/TermsAndConditions';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import Checkout from '@/pages/Checkout';
import NotFound from '@/pages/NotFound';
import ChangePassword from '@/pages/ChangePassword';
import MockTest from '@/pages/MockTest';
import TestCompletionPage from '@/pages/TestCompletion';
import Classroom from '@/pages/Classroom';
// import ClassroomChat from "./pages/ClassroomChat";
import VerifyEmail from '@/pages/VerifyEmail';
import UsernamePage from '@/pages/UsernamePage';
import WelcomeNewUserPage from './pages/WelcomeNewUserPage';
import AllSetPage from '@/pages/AllSetPage';
import MockTestResults from '@/pages/MockTestResults';
import TestCompletion from '@/pages/TestResults';
import Career from '@/pages/Career';
import TeachingAmbassadors from '@/pages/TeachingAmbassadors';
import InternshipApplication from '@/pages/InternshipApplication';
import SavedMCQsPage from '@/pages/SavedMCQsPage';
import Announcements from '@/pages/Announcements';
import ContactUsPage from '@/pages/ContactUsPage';
import FLP from '@/pages/FLP';
import FLPResults from '@/pages/FLPResults';
import FLPResultDetail from '@/components/FLPResultDetail'; // Adjust path if needed
import ForgotPassword from '@/pages/ForgotPassword'; // Assuming you have a custom hook for authentication
import UpdatePassword from '@/pages/UpdatePassword'; // Add this import
import Flashcards from '@/pages/Flashcards'; // Add this import
import InstallApp from '@/pages/InstallApp'; // Add this import
import RefundPolicy from '@/pages/RefundPolicy'; // Add this import
import './App.css';

// Import the VideoCallProvider
import { VideoCallProvider } from '@/video-sdk/VideoCallProvider'; // Adjust path if necessary

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        themes={['light', 'dark']}
        forcedTheme={undefined}
      >
        <Router>
          <div className="App min-h-screen w-full bg-background text-foreground">
            {/* Wrap Routes with VideoCallProvider */}
            <VideoCallProvider>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/mcqs" element={<MCQs />} />
                <Route path="/battle" element={<Battle />} />
                <Route path="/ai" element={<AI />} />
                <Route path="/ai/test-generator" element={<AITestGeneratorPage />} />
                <Route path="/ai/chatbot" element={<AIChatbotPage />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                {/* <Route path="/admin15" element={<Admin15 />} /> */}
                <Route path="/profile" element={<Profile />} />
                <Route path="/profile/password" element={<ChangePassword />} />
                <Route path="/profile/upgrade" element={<Profile />} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/privacypolicy" element={<PrivacyPolicy />} />
                {/* <Route path="/study-materials" element={<StudyMaterials />} /> */}
                <Route path="/mock-test" element={<MockTest />} />
                <Route path="/test-completed" element={<TestCompletionPage />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/terms" element={<TermsAndConditions />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/classroom" element={<Classroom />} />
                {/* <Route path="/classroom/:id" element={<ClassroomChat />} /> */}
                <Route path="/welcome-new-user" element={<WelcomeNewUserPage />} />
                <Route path="/all-set" element={<AllSetPage />} />
                <Route path="/settings/username" element={<UsernamePage />} />
                <Route path="/results" element={<MockTestResults />} />
                <Route path="/test-summary" element={<TestCompletion />} />
                <Route path="/career" element={<Career />} />
                <Route path="/teaching-career" element={<TeachingAmbassadors />} />
                <Route path="/summerinternship2025" element={<InternshipApplication />} />
                <Route path="/saved-mcqs" element={<SavedMCQsPage />} />
                <Route path="/announcements" element={<Announcements />} />
                <Route path="/contact-us" element={<ContactUsPage />} />
                <Route path="/flp" element={<FLP />} />
                <Route path="/flp-result" element={<FLPResults />} />
                <Route path="/results/flp/:id" element={<FLPResultDetail />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/update-password" element={<UpdatePassword />} /> {/* This is the new route */}
                <Route path="/flashcards" element={<Flashcards />} /> {/* This is the new route */}
                <Route path="/flashcards" element={<Flashcards />} /> {/* This is the new route */}
                <Route path="/refund-policy" element={<RefundPolicy />} /> {/* This is the new route */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </VideoCallProvider>
            <Toaster />
          </div>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;