import React from 'react';
import { motion } from 'motion/react';
import { Check, X } from 'lucide-react';
import { NavTab, WorkflowStatusSummary } from '../types';
import { BrandIcon, BrandIconName } from './BrandIcon';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onGenerateAll: () => void;
  activeEventName: string;
  workflowStatus: WorkflowStatusSummary;
  readyCount: number;
  totalCount: number;
  isGeneratingBatch: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const WORKFLOW_NAV_ITEMS: {
  id: Exclude<NavTab, 'dashboard'>;
  stepNumber: number;
  label: string;
  icon: BrandIconName;
}[] = [
  { id: 'setup', stepNumber: 1, label: 'Info & Template', icon: 'doc-upload' },
  { id: 'guests', stepNumber: 2, label: 'Daftar Penerima', icon: 'nav-guests' },
  { id: 'layout', stepNumber: 3, label: 'Tata Letak', icon: 'nav-design' },
  { id: 'batch', stepNumber: 4, label: 'Generate & Laporan', icon: 'nav-export-pdf' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  onGenerateAll,
  activeEventName,
  workflowStatus,
  readyCount,
  totalCount,
  isGeneratingBatch,
  mobileOpen,
  onCloseMobile,
}) => {
  const isStepDone = (id: Exclude<NavTab, 'dashboard'>): boolean => {
    switch (id) {
      case 'setup':
        return workflowStatus.setupReady;
      case 'guests':
        return workflowStatus.guestsReady;
      case 'layout':
        return workflowStatus.layoutReady;
      case 'batch':
        return workflowStatus.batchDone;
    }
  };

  const sidebarBody = (
    <aside
      className="flex flex-col justify-between h-full w-[252px] shrink-0 text-white select-none py-5 pl-4 pr-0"
      style={{ backgroundColor: 'var(--bg-sidebar)' }}
    >
      <div>
        {/* Brand Header */}
        <div className="flex items-center justify-between pr-4 pl-2 mb-7">
          <div className="flex items-center gap-3">
            <BrandIcon
              name="brand-rumah-gadang"
              className="w-10 h-10 shrink-0 text-[#F9E99B]"
            />
            <div className="min-w-0">
              <div className="font-display font-bold text-[18px] leading-tight tracking-tight text-white whitespace-nowrap">
                Ranah Invite
              </div>
              <div className="text-[11px] font-medium text-white/80 tracking-wide whitespace-nowrap">
                Studio Undangan PDF
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-full text-white/85 hover:text-white hover:bg-white/15"
            aria-label="Tutup menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Hub + 4 Ordered Workflow Steps with PinHome Concave Curved Cutout */}
        <nav aria-label="Navigasi Utama" className="flex flex-col gap-1.5 relative">
          {/* Hub: Beranda Event */}
          <button
            type="button"
            onClick={() => {
              onSelectTab('dashboard');
              onCloseMobile();
            }}
            className={`relative flex items-center gap-3 px-4 py-3 text-left text-[14px] font-medium transition-colors duration-200 rounded-l-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F9DE6C] ${
              activeTab === 'dashboard'
                ? 'text-[#1B1B4B] font-semibold'
                : 'text-white/90 hover:text-white hover:bg-white/10'
            }`}
          >
            {activeTab === 'dashboard' && (
              <motion.div
                layoutId="sidebarActiveTab"
                transition={{
                  type: 'spring',
                  stiffness: 380,
                  damping: 34,
                }}
                className="absolute inset-0 bg-white rounded-l-full"
                style={{ zIndex: 0 }}
              >
                <span className="pinhome-tab-scoop-top hidden lg:block" aria-hidden="true" />
                <span className="pinhome-tab-scoop-bottom hidden lg:block" aria-hidden="true" />
              </motion.div>
            )}
            <BrandIcon
              name="nav-dashboard"
              className={`w-6 h-6 relative z-10 shrink-0 transition-colors duration-200 ${
                activeTab === 'dashboard' ? 'text-[#1F9B96]' : 'text-[#F9E99B]'
              }`}
            />
            <span className="relative z-10 whitespace-nowrap truncate">
              Beranda Event
            </span>
          </button>

          {/* Subtle Workflow Divider */}
          <div className="px-4 pt-3.5 pb-1 pr-5">
            <div className="border-t border-white/18 pt-3 text-[11px] font-semibold text-white/75 tracking-wide">
              Alur Pembuatan
            </div>
          </div>

          {/* 4 Ordered Workflow Steps */}
          {WORKFLOW_NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            const done = isStepDone(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`relative flex items-center gap-3 px-4 py-2.5 text-left text-[13.5px] font-medium transition-colors duration-200 rounded-l-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F9DE6C] ${
                  isActive
                    ? 'text-[#1B1B4B] font-semibold'
                    : 'text-white/90 hover:text-white hover:bg-white/10'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebarActiveTab"
                    transition={{
                      type: 'spring',
                      stiffness: 380,
                      damping: 34,
                    }}
                    className="absolute inset-0 bg-white rounded-l-full"
                    style={{ zIndex: 0 }}
                  >
                    <span className="pinhome-tab-scoop-top hidden lg:block" aria-hidden="true" />
                    <span className="pinhome-tab-scoop-bottom hidden lg:block" aria-hidden="true" />
                  </motion.div>
                )}

                <span
                  className={`relative z-10 w-6 h-6 rounded-full inline-flex items-center justify-center text-[11px] font-bold shrink-0 tabular-nums transition-colors ${
                    isActive
                      ? 'bg-[#1F9B96] text-white'
                      : done
                        ? 'bg-[#F9E99B]/22 text-[#F9E99B] border border-[#F9E99B]/45'
                        : 'bg-white/14 text-white/85'
                  }`}
                >
                  {done && !isActive ? (
                    <Check className="w-3.5 h-3.5 stroke-[2.75]" />
                  ) : (
                    item.stepNumber
                  )}
                </span>

                <span className="relative z-10 whitespace-nowrap truncate flex-1">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom-left PinHome Frosted Pastel Action Card */}
      <div className="pr-4 pl-1 mt-6 space-y-3.5">
        <div
          aria-label="Ikon Pariwisata Sumatera Barat"
          className="flex items-center justify-between px-1.5 py-0.5"
        >
          {(
            [
              { icon: 'sumbar-rumah-gadang', label: 'Rumah Gadang' },
              { icon: 'sumbar-jam-gadang', label: 'Jam Gadang' },
              { icon: 'sumbar-mountain', label: 'Danau & Gunung' },
              { icon: 'sumbar-surfer', label: 'Ombak Mentawai' },
              { icon: 'sumbar-boat', label: 'Wisata Bahari' },
              { icon: 'sumbar-beach', label: 'Pantai Sumbar' },
            ] as const
          ).map((emblem) => (
            <span
              key={emblem.icon}
              title={emblem.label}
              className="inline-flex items-center justify-center opacity-85 hover:opacity-100 transition-opacity"
            >
              <BrandIcon
                name={emblem.icon}
                className="w-5.5 h-5.5 text-[#F9E99B]"
              />
            </span>
          ))}
        </div>

        <div className="relative overflow-hidden rounded-[24px] bg-white/18 backdrop-blur-xs p-4 text-center">
          {/* Playful PinHome blush-pink geometric accent orb */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-3 right-3 w-11 h-11 rounded-full bg-[#F7B7C6]/85"
          />

          <div className="relative z-10 flex items-center justify-center mb-2 pt-0.5">
            <BrandIcon
              name="brand-skyline"
              white
              className="w-full h-14 drop-shadow-xs"
            />
          </div>

          <div className="relative z-10 mb-3">
            <p
              title={activeEventName}
              className="font-display font-bold text-[13.5px] text-white leading-snug truncate"
            >
              {activeEventName}
            </p>
            <p className="text-[11.5px] text-white/85 mt-1 leading-relaxed tabular-nums">
              {totalCount === 0
                ? 'Daftar penerima belum diisi'
                : `${totalCount} penerima · ${readyCount} siap dibuat`}
            </p>
          </div>

          {totalCount === 0 ? (
            <button
              type="button"
              onClick={() => {
                onSelectTab('guests');
                onCloseMobile();
              }}
              className="relative z-10 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-full font-display font-bold text-[12.5px] text-[#1B1B4B] transition-all duration-200 hover:brightness-95 active:scale-[0.98] whitespace-nowrap shadow-xs"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              <BrandIcon name="nav-guests" className="w-4.5 h-4.5 text-[#1B1B4B]" />
              <span>Isi Daftar Penerima</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isGeneratingBatch}
              onClick={() => {
                onGenerateAll();
                onCloseMobile();
              }}
              className="relative z-10 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-full font-display font-bold text-[12.5px] text-[#1B1B4B] transition-all duration-200 hover:brightness-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-xs"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              <BrandIcon name="nav-export-pdf" className="w-4.5 h-4.5 text-[#1B1B4B]" />
              <span>{isGeneratingBatch ? 'Memproses PDF...' : 'Generate Semua PDF'}</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <div className="hidden lg:flex h-full shrink-0">{sidebarBody}</div>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#1B1B4B]/40 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full">{sidebarBody}</div>
        </div>
      )}
    </>
  );
};
