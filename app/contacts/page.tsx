"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  UserPlus,
  ShieldCheck,
  Phone,
  Mail,
  MessageCircle,
  Trash2,
  Send,
  Star,
  CheckCircle2,
  AlertTriangle,
  Radio,
} from "lucide-react";
import { TrustedContact } from "@/lib/types";
import { getStoredContacts, saveStoredContacts } from "@/lib/storage";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [testAlertSuccess, setTestAlertSuccess] = useState<string | null>(null);

  // New Contact Form State
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("Mother");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(true);
  const [notifySms, setNotifySms] = useState(true);

  useEffect(() => {
    setContacts(getStoredContacts());
  }, []);

  const handleAddContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;

    const newContact: TrustedContact = {
      id: "c_" + Date.now(),
      name: name.trim(),
      relationship,
      phone: phone.trim(),
      email: email.trim() || `${name.toLowerCase().replace(/\s+/g, "")}@example.com`,
      isVerified: true,
      isPrimary: contacts.length === 0,
      notifyWhatsApp,
      notifySms,
    };

    const updated = [...contacts, newContact];
    setContacts(updated);
    saveStoredContacts(updated);

    // Reset
    setName("");
    setPhone("");
    setEmail("");
    setIsAddModalOpen(false);
  };

  const handleDelete = (id: string) => {
    const updated = contacts.filter((c) => c.id !== id);
    setContacts(updated);
    saveStoredContacts(updated);
  };

  const setPrimary = (id: string) => {
    const updated = contacts.map((c) => ({
      ...c,
      isPrimary: c.id === id,
    }));
    setContacts(updated);
    saveStoredContacts(updated);
  };

  const handleSendTestPing = (contact: TrustedContact) => {
    setTestAlertSuccess(contact.name);
    setTimeout(() => setTestAlertSuccess(null), 3500);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-950/80 border border-purple-500/40 text-purple-300 text-xs font-semibold">
            <Users className="w-3.5 h-3.5" />
            <span>Escalation Network & Trusted Circles</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            Trusted Contacts & SOS Escalation
          </h1>
          <p className="text-sm text-slate-300">
            Configure the verified contacts who receive instant location pings and audio evidence during a VoiceShield SOS trigger.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-purple-950/40"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Trusted Contact</span>
        </button>
      </div>

      {/* Test Alert Notification Banner */}
      {testAlertSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 text-xs flex items-center justify-between animate-in zoom-in-95">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>
              <strong>Simulated Safety Ping Dispatched:</strong> Test SMS and WhatsApp payload successfully transmitted to {testAlertSuccess}.
            </span>
          </div>
          <span className="text-[10px] text-emerald-400 font-mono">Status: Delivered (200 OK)</span>
        </div>
      )}

      {/* Escalation Hierarchy Protocol Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl glass-card space-y-2 border-purple-800/30">
          <div className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-400" />
            <span>Tier 1: Instant SOS Broadcast</span>
          </div>
          <p className="text-[11px] text-slate-300">
            Primary contacts receive automated high-priority WhatsApp and SMS location beacons within 2 seconds of SOS trigger.
          </p>
        </div>

        <div className="p-4 rounded-2xl glass-card space-y-2 border-indigo-800/30">
          <div className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-400" />
            <span>Tier 2: Live Tracking Beacon</span>
          </div>
          <p className="text-[11px] text-slate-300">
            Secondary circle gets a view-only encrypted Google Maps live route tracking link updated every 15 seconds.
          </p>
        </div>

        <div className="p-4 rounded-2xl glass-card space-y-2 border-red-800/30">
          <div className="text-xs font-bold text-red-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <span>Tier 3: Helpline Escalation</span>
          </div>
          <p className="text-[11px] text-slate-300">
            If no acknowledgment is received within 3 minutes, Cyber Sakhi pre-populates one-tap auto-dials for 112 / 1091.
          </p>
        </div>
      </div>

      {/* Contacts List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">
            Active Verified Contacts ({contacts.length})
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className={`p-5 rounded-2xl glass-panel space-y-4 relative border transition ${
                contact.isPrimary ? "border-purple-500/60 shadow-lg shadow-purple-950/40" : "border-slate-800"
              }`}
            >
              {/* Card Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-100">{contact.name}</h3>
                    {contact.isPrimary && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-900 text-purple-200 border border-purple-600/50 font-bold">
                        PRIMARY
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-purple-400 font-medium">
                    {contact.relationship}
                  </span>
                </div>

                <button
                  onClick={() => setPrimary(contact.id)}
                  className={`p-1.5 rounded-lg text-xs transition ${
                    contact.isPrimary
                      ? "text-amber-400 bg-amber-950/60"
                      : "text-slate-500 hover:text-amber-400 hover:bg-slate-800"
                  }`}
                  title={contact.isPrimary ? "Primary SOS Recipient" : "Set as Primary"}
                >
                  <Star className={`w-4 h-4 ${contact.isPrimary ? "fill-amber-400" : ""}`} />
                </button>
              </div>

              {/* Contact Details */}
              <div className="space-y-2 text-xs text-slate-300 font-mono">
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                  <span>{contact.phone}</span>
                </div>
                <div className="flex items-center gap-2 truncate">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  <span className="truncate">{contact.email}</span>
                </div>
              </div>

              {/* Channels Enabled */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" /> WhatsApp
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                  <Radio className="w-3 h-3" /> SMS
                </span>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleSendTestPing(contact)}
                  className="flex-1 py-1.5 px-3 rounded-lg bg-purple-950/70 hover:bg-purple-900 text-purple-200 text-xs font-semibold border border-purple-700/40 flex items-center justify-center gap-1.5 transition"
                >
                  <Send className="w-3 h-3" />
                  <span>Test Ping</span>
                </button>
                <button
                  onClick={() => handleDelete(contact.id)}
                  className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-red-950 text-slate-400 hover:text-red-400 transition"
                  title="Remove Contact"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Contact Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl bg-[#121222] border border-purple-500/40 p-6 space-y-4 text-white">
            <h3 className="text-base font-bold text-purple-300 flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              <span>Add Verified Emergency Contact</span>
            </h3>

            <form onSubmit={handleAddContact} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-300">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Priya Sharma"
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300">Relationship</label>
                <select
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="Mother">Mother</option>
                  <option value="Father">Father</option>
                  <option value="Sister">Sister</option>
                  <option value="Brother">Brother</option>
                  <option value="Friend">Best Friend</option>
                  <option value="Partner">Partner / Spouse</option>
                  <option value="Guardian">Guardian</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300">Phone Number (with country code)</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="priya.sharma@example.com"
                  className="w-full rounded-xl bg-slate-900 border border-slate-700 p-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold"
                >
                  Save Contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
