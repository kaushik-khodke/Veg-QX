"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

export default function SidebarAndMainWrapper({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="flex h-screen w-full relative overflow-hidden bg-[var(--bg-primary)] transition-colors duration-200">
      {/* Sidebar Container — Pinned to Left */}
      <div 
        className={`transition-all duration-300 ease-in-out z-40 h-screen shrink-0 ${
          isOpen ? "w-64 font-sans opacity-100" : "w-0 opacity-0 overflow-hidden pointer-events-none"
        }`}
      >
        <Sidebar isOpen={isOpen} onClose={() => setIsOpen(false)} />
      </div>

      {/* Main Content Area — TopBar pinned at top, main container scrolls smoothly */}
      <div className="flex-1 flex flex-col h-screen min-w-0 overflow-hidden">
        <TopBar isSidebarOpen={isOpen} onToggleSidebar={() => setIsOpen(!isOpen)} />
        <main className="flex-1 p-6 relative overflow-y-auto">
          <div className="max-w-7xl mx-auto w-full pb-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
