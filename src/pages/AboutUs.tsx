import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Award, GraduationCap, Heart, Scale, Target, Users, Sparkles } from "lucide-react";
import appanPhoto from "@/assets/appan.jpg";
import mahinanPhoto from "@/assets/mahinan.jpg";
import gajanPhoto from "@/assets/gajan.jpg";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import LexSentinelLogo from "@/components/LexSentinelLogo";
import PublicNav from "@/components/PublicNav";

/* ─── Founder data ─── */
const founders = [
  {
    name: "Mahinan Pathmanathan",
    role: "Co-Founder",
    education: "LL.B, University of Essex",
    photo: mahinanPhoto,
    highlights: [
      "Solicitor with over 20 years of experience in residential and commercial conveyancing",
      "Managing Director of Smart Legal — described as 'magnificent' by The Sunday Times and The Times",
      "Led Smart Legal to win Best Small Conveyancer of the Year three times, recognised for client-centric excellence",
      "5.0/5.0 client rating on ReviewSolicitors, reflecting a relentless commitment to service quality",
      "Pioneer in adopting legal technology to streamline case management and improve transparency for clients",
    ],
  },
  {
    name: "Gajan Pathmanathan",
    role: "Co-Founder",
    education: "LL.M, London School of Economics (LSE)",
    photo: gajanPhoto,
    highlights: [
      "Solicitor with over 20 years of experience in property law",
      "Experienced property developer with deep knowledge of residential and commercial transactions",
      "Brings a unique dual perspective as both a legal practitioner and property investor",
      "Combines hands-on development experience with legal expertise to shape practical, real-world AI tools for conveyancers",
    ],
  },
  {
    name: "Appan Pathmanathan",
    role: "Co-Founder",
    education: "LL.M, University College London (UCL)",
    photo: appanPhoto,
    highlights: [
      "Solicitor with over 20 years of experience in property law and conveyancing",
      "Currently Solicitor and Head of Business Development at Smart Legal, a three-time award-winning conveyancing firm based in London",
      "Proven track record of scaling conveyancing operations, combining legal expertise with commercial strategy",
      "Deep understanding of the day-to-day challenges faced by conveyancers — from search review bottlenecks to compliance pressures",
    ],
  },
];

const values = [
  {
    icon: Target,
    title: "Purpose-Built for Conveyancers",
    description:
      "Every feature is designed by practising solicitors who understand the pressures of modern conveyancing — because we've lived them.",
  },
  {
    icon: Sparkles,
    title: "Technology That Empowers",
    description:
      "We believe AI should augment professional judgement, not replace it. Our tools give conveyancers superpowers, not substitutes.",
  },
  {
    icon: Scale,
    title: "Compliance Without Compromise",
    description:
      "Maintaining the highest standards of regulatory compliance while dramatically reducing the time and cost of doing so.",
  },
  {
    icon: Heart,
    title: "Better Outcomes for Everyone",
    description:
      "Faster turnaround, lower risk, and a consistently outstanding client experience — that's the promise we're building towards.",
  },
];

const anim = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.5 } }),
};

/* ─── Page ─── */
const AboutUs = () => {
  const [lightboxPhoto, setLightboxPhoto] = useState<{ src: string; name: string } | null>(null);

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      {/* Photo lightbox */}
      <Dialog open={!!lightboxPhoto} onOpenChange={() => setLightboxPhoto(null)}>
        <DialogContent className="max-w-lg p-2 bg-background border-border">
          {lightboxPhoto && (
            <div className="space-y-2">
              <img
                src={lightboxPhoto.src}
                alt={`${lightboxPhoto.name} portrait`}
                className="w-full rounded-lg object-cover object-top"
              />
              <p className="text-center text-sm font-medium text-foreground pb-1">{lightboxPhoto.name}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

    <main className="max-w-5xl mx-auto px-4 py-12 pt-24 space-y-16">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center space-y-4"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-sm font-medium">
          <Users size={15} />
          About Us
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-foreground">
          Built by Conveyancers, for Conveyancers
        </h1>
        <p className="text-muted-foreground max-w-3xl mx-auto text-base md:text-lg leading-relaxed">
          Olimey AI was founded by three brothers — Mahinan, Gajan and Appan Pathmanathan — each a
          solicitor with over 20 years of experience on the front line of property law. We saw first-hand
          how talented conveyancers were held back by manual processes, rising compliance burdens, and
          tools that weren't built for the way they actually work.
          We created Olimey AI to change that.
        </p>
      </motion.section>

      {/* Mission */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Card className="border-accent/20 bg-accent/5">
          <CardContent className="py-8 px-6 md:px-10 space-y-4 text-center">
            <h2 className="text-2xl font-bold text-foreground">Our Mission</h2>
            <p className="text-muted-foreground max-w-3xl mx-auto text-base leading-relaxed">
              To improve the working life of every conveyancer by giving firms the AI-powered tools they need to
              work faster, reduce costs, and deliver a consistently outstanding service to their clients —
              all while maintaining the highest standards of compliance and professional integrity.
            </p>
          </CardContent>
        </Card>
      </motion.section>

      {/* Founders */}
      <section className="space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Meet the Founders</h2>
          <p className="text-muted-foreground text-sm">
            Over 60 years of combined experience in property law and conveyancing
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {founders.map((founder, i) => (
            <motion.div
              key={founder.name}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={anim}
            >
              <Card className="border-border h-full">
                <CardContent className="pt-6 space-y-4">
                    <div className="flex items-center gap-4">
                    <img
                      src={founder.photo}
                      alt={`${founder.name} portrait`}
                      className="w-16 h-16 rounded-full object-cover object-top shrink-0 border-2 border-accent/20 cursor-pointer hover:border-accent/50 transition-colors"
                      onClick={() => setLightboxPhoto({ src: founder.photo, name: founder.name })}
                    />
                    <div>
                      <h3 className="text-lg font-bold text-foreground">{founder.name}</h3>
                      <p className="text-sm font-medium text-accent">{founder.role}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <GraduationCap size={15} className="shrink-0" />
                    <span>{founder.education}</span>
                  </div>

                  <Separator />

                  <ul className="space-y-2.5">
                    {founder.highlights.map((h, j) => (
                      <li key={j} className="flex gap-2 text-sm text-muted-foreground">
                        <Award size={14} className="text-accent shrink-0 mt-0.5" />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Values */}
      <section className="space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-foreground">What Drives Us</h2>
          <p className="text-muted-foreground text-sm">
            The principles behind every feature we build
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          {values.map((v, i) => (
            <motion.div
              key={v.title}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={anim}
            >
              <Card className="border-border h-full">
                <CardContent className="pt-6 flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                    <v.icon size={20} className="text-accent" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">{v.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{v.description}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="text-center space-y-4"
      >
        <h2 className="text-2xl font-bold text-foreground">
          Ready to transform your conveyancing practice?
        </h2>
        <p className="text-muted-foreground text-sm max-w-xl mx-auto">
          Join the growing number of firms using Olimey AI to work smarter, reduce risk,
          and deliver an exceptional client experience.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/signup">
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
              Get Started <ArrowRight size={16} />
            </Button>
          </Link>
        </div>
      </motion.section>
    </main>

    {/* Footer */}
    <footer className="border-t border-border mt-16 py-6">
      <p className="text-center text-xs text-muted-foreground">
        © 2026 Olimey AI ·{" "}
        <Link to="/terms" className="text-accent hover:underline">Terms</Link>
        {" · "}
        <Link to="/privacy" className="text-accent hover:underline">Privacy</Link>
      </p>
    </footer>
  </div>
  );
};

export default AboutUs;
