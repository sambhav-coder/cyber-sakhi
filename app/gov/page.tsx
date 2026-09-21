"use client";

import React, { useState } from "react";
import { GovHeader } from "@/components/gov/GovHeader";
import { GovSafetyTicker } from "@/components/gov/GovSafetyTicker";
import { GovFooter } from "@/components/gov/GovFooter";
import { GovPageBackground } from "@/components/gov/GovPageBackground";
import { GovHero } from "@/components/gov/GovHero";
import { GovVerifiedInfo } from "@/components/gov/GovVerifiedInfo";
import { GovUpdatesSection } from "@/components/gov/GovUpdatesSection";
import { GovEventModal } from "@/components/gov/GovEventModal";
import { GovNewsModal } from "@/components/gov/GovNewsModal";
import type { CurrentEvent } from "@/components/gov/GovCurrentEvents";
import type { CyberNewsItem } from "@/components/gov/GovCyberNews";

export default function GovLandingPage() {
  const [selectedEvent, setSelectedEvent] = useState<CurrentEvent | null>(null);
  const [selectedNews, setSelectedNews] = useState<CyberNewsItem | null>(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [newsModalOpen, setNewsModalOpen] = useState(false);

  const handleEventClick = (event: CurrentEvent) => {
    setSelectedEvent(event);
    setEventModalOpen(true);
  };

  const handleNewsClick = (news: CyberNewsItem) => {
    setSelectedNews(news);
    setNewsModalOpen(true);
  };

  return (
    <div className="flex min-h-screen flex-col relative">
      {/* Fixed full-page background */}
      <GovPageBackground />

      {/* Content */}
      <div className="relative z-10 flex min-h-screen flex-col">
        <GovHeader overHero />

        {/* Cyber-safety announcement ticker (directly below the navbar) */}
        <GovSafetyTicker />

        <main className="flex-1">
          {/* Hero Section */}
          <GovHero />

          {/* Basic Verified Information — 1930 helpline + official resources */}
          <GovVerifiedInfo />

          {/* Current Events + Cyber Safety News */}
          <GovUpdatesSection
            onEventClick={handleEventClick}
            onNewsClick={handleNewsClick}
          />
        </main>

        <GovFooter />
      </div>

      {/* Modals */}
      <GovEventModal
        event={selectedEvent}
        isOpen={eventModalOpen}
        onClose={() => setEventModalOpen(false)}
      />

      <GovNewsModal
        news={selectedNews}
        isOpen={newsModalOpen}
        onClose={() => setNewsModalOpen(false)}
      />
    </div>
  );
}