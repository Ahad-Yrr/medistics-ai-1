import React, { useEffect, useState } from "react";
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaWhatsapp, FaEnvelope } from "react-icons/fa";
import { useTheme } from "next-themes";

interface MaintenanceProps {
  resumeAt: string | null;
}

const Maintenance: React.FC<MaintenanceProps> = ({ resumeAt }) => {
  const { theme } = useTheme();
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  useEffect(() => {
    if (!resumeAt) return;

    const calculateTimeLeft = () => {
      const difference = +new Date(resumeAt) - +new Date();
      let timeLeft = null;

      if (difference > 0) {
        timeLeft = {
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        };
      }
      return timeLeft;
    };

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    setTimeLeft(calculateTimeLeft());

    return () => clearInterval(timer);
  }, [resumeAt]);

  const socialLinks = [
    { icon: <FaFacebookF />, href: "https://facebook.com/medisticsapp", color: "hover:text-[#1877F2]" },
    { icon: <FaInstagram />, href: "https://instagram.com/medistics.app", color: "hover:text-[#E1306C]" },
    { icon: <FaLinkedinIn />, href: "https://linkedin.com/in/medisticsapp", color: "hover:text-[#0077B5]" },
    { icon: <FaWhatsapp />, href: "https://wa.me/03392456162", color: "hover:text-[#25D366]" },
    { icon: <FaEnvelope />, href: "mailto:contact@medmacs.app", color: "hover:text-[#EA4335]" },
  ];

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background text-foreground p-4 selection:bg-purple-500/30">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-pink-500/10 pointer-events-none" />
      
      <div className="z-10 w-full max-w-2xl text-center space-y-12 animate-fade-in">
        {/* Logo Section */}
        <div className="flex flex-col items-center space-y-4">
          <div className="relative group">
            <div className="absolute -inset-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full opacity-20 group-hover:opacity-40 blur-xl transition-opacity duration-500" />
            <img
              src="/lovable-uploads/161d7edb-aa7b-4383-a8e2-75b6685fc44f.png"
              alt="Medistics Logo"
              className="w-24 h-24 object-contain relative transition-transform duration-500 group-hover:scale-110"
            />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent italic">
            Medistics.App
          </h1>
        </div>

        {/* Content Section */}
        <div className="space-y-6">
          <div className="px-6 py-8 backdrop-blur-md bg-card/30 border border-border/50 rounded-3xl shadow-2xl space-y-4">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight">
              Under Maintenance
            </h2>
            <p className="text-xl text-muted-foreground max-w-md mx-auto leading-relaxed">
              We're polishing things up to give you a better experience. We'll be back online shortly!
            </p>
          </div>

          {/* Timer Section */}
          {timeLeft && (
            <div className="grid grid-cols-4 gap-4 max-w-sm mx-auto">
              {Object.entries(timeLeft).map(([unit, value]) => (
                <div key={unit} className="flex flex-col items-center">
                  <div className="w-14 h-14 md:w-16 md:h-16 flex items-center justify-center bg-primary/5 border border-primary/10 rounded-2xl backdrop-blur-sm shadow-lg">
                    <span className="text-2xl font-bold text-primary tabular-nums">
                      {value}
                    </span>
                  </div>
                  <span className="text-[10px] uppercase tracking-widest font-bold mt-2 text-muted-foreground">
                    {unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contact/Social Section */}
        <div className="space-y-6 pt-8 border-t border-border/50">
          <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground/60">
            Get in touch
          </p>
          <div className="flex justify-center items-center gap-6">
            {socialLinks.map((social, index) => (
              <a
                key={index}
                href={social.href}
                target="_blank"
                rel="noreferrer"
                className={`text-2xl transition-all duration-300 hover:-translate-y-1 ${social.color} opacity-70 hover:opacity-100`}
              >
                {social.icon}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-8 left-0 right-0 text-center">
        <p className="text-xs font-medium text-muted-foreground/40 italic">
          &copy; {new Date().getFullYear()} Medmacs. All Rights Reserved.
        </p>
      </div>
    </div>
  );
};

export default Maintenance;
