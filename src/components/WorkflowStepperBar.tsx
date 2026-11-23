import React from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight } from 'lucide-react';
import { EventMetadata, NavTab, WorkflowStatusSummary } from '../types';
import { SmartMarqueeText } from './UiPolish';

export type WorkflowStepId = Exclude<NavTab, 'dashboard'>;

export interface WorkflowStepMeta {
  id: WorkflowStepId;
  stepNumber: number;
  shortLabel: string;
  fullLabel: string;
  description: string;
}

export const WORKFLOW_STEPS: WorkflowStepMeta[] = [
  {
    id: 'setup',
    stepNumber: 1,
    shortLabel: 'Info & Template',
    fullLabel: 'Info Acara & Template',
    description: 'Detail acara & gambar undangan',
  },
  {
    id: 'guests',
    stepNumber: 2,
    shortLabel: 'Daftar Penerima',
    fullLabel: 'Daftar Penerima & RSVP',
    description: 'Bank PDF, Excel, atau input manual',
  },
  {
    id: 'layout',
    stepNumber: 3,
    shortLabel: 'Tata Letak',
    fullLabel: 'Tata Letak & Pratinjau',
    description: 'Posisi nama, instansi & QR Code',
  },
  {
    id: 'batch',
    stepNumber: 4,
    shortLabel: 'Generate & Laporan',
    fullLabel: 'Generate PDF & Laporan',
    description: 'Unduh PDF, ZIP, Laporan PDF & XLS',
  },
];

interface WorkflowStepperBarProps {
  activeStep: WorkflowStepId;
  metadata: EventMetadata;
  workflowStatus: WorkflowStatusSummary;
  onSelectTab: (tab: NavTab) => void;
}

export const WorkflowStepperBar: React.FC<WorkflowStepperBarProps> = ({
  activeStep,
  metadata,
  workflowStatus,
  onSelectTab,
}) => {
  const isStepComplete = (stepId: WorkflowStepId): boolean => {
    switch (stepId) {
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

  const getStepSummary = (stepId: WorkflowStepId): string => {
    switch (stepId) {
      case 'setup':
        return `${workflowStatus.pageCount} Halaman`;
      case 'guests':
        return `${workflowStatus.recipientCount} penerima`;
      case 'layout':
        return `${workflowStatus.visibleOverlayCount} elemen`;
      case 'batch':
        return `${workflowStatus.generatedCount}/${workflowStatus.recipientCount} PDF`;
    }
  };

  return (
    <div className="mb-6 rounded-[22px] border border-[#DCEEF4] bg-[#F4FBFD] px-4 py-3.5 space-y-3">
      {/* Compact Active Event Context Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#E3F1F6]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-[11px] font-semibold text-[#167F7B] whitespace-nowrap shrink-0">
            Event Aktif:
          </span>
          <span className="font-display font-bold text-[13.5px] text-[#1B1B4B] min-w-0 max-w-[420px]">
            <SmartMarqueeText text={metadata.eventName || 'Event Tanpa Nama'} />
          </span>
          {metadata.date && (
            <span className="hidden sm:inline text-[12px] text-[#757E96] whitespace-nowrap shrink-0">
              · {metadata.date}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => onSelectTab('dashboard')}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#1F9B96] hover:text-[#167F7B] hover:underline whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Beranda / Ganti Event</span>
        </button>
      </div>

      {/* Horizontal 4-Step Sequential Bar */}
      <nav
        aria-label="Tahapan Pembuatan Undangan"
        className="grid grid-cols-2 lg:grid-cols-4 gap-2"
      >
        {WORKFLOW_STEPS.map((step, index) => {
          const isCurrent = activeStep === step.id;
          const isDone = isStepComplete(step.id);

          return (
            <div key={step.id} className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => onSelectTab(step.id)}
                aria-current={isCurrent ? 'step' : undefined}
                className={`flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2 rounded-2xl text-left transition-all duration-150 border ${
                  isCurrent
                    ? 'bg-[#1F9B96] text-white border-[#1F9B96] shadow-[0_6px_16px_-8px_rgba(31,155,150,0.55)]'
                    : isDone
                      ? 'bg-white text-[#1B1B4B] border-[#C5E8E2] hover:border-[#1F9B96]/60 hover:bg-[#EBF9F7]'
                      : 'bg-white/80 text-[#757E96] border-[#E3F1F6] hover:border-[#B5E4F1] hover:bg-white hover:text-[#1B1B4B]'
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-[11px] font-bold shrink-0 tabular-nums ${
                    isCurrent
                      ? 'bg-[#F9DE6C] text-[#1B1B4B]'
                      : isDone
                        ? 'bg-[#DCF5F1] text-[#157A76]'
                        : 'bg-[#EDF5F8] text-[#757E96]'
                  }`}
                >
                  {isDone && !isCurrent ? (
                    <Check className="w-3.5 h-3.5 stroke-[2.75]" />
                  ) : (
                    step.stepNumber
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div
                    className={`text-[12.5px] font-semibold leading-tight truncate ${
                      isCurrent ? 'text-white' : 'text-[#1B1B4B]'
                    }`}
                  >
                    {step.shortLabel}
                  </div>
                  <div
                    className={`text-[11px] leading-tight mt-0.5 truncate tabular-nums ${
                      isCurrent ? 'text-white/85' : 'text-[#757E96]'
                    }`}
                  >
                    {getStepSummary(step.id)}
                  </div>
                </div>
              </button>

              {index < WORKFLOW_STEPS.length - 1 && (
                <ChevronRight
                  aria-hidden="true"
                  className="hidden lg:block w-4 h-4 text-[#9DCEDB] shrink-0"
                />
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
};

interface StepFooterNavProps {
  prevLabel: string;
  onPrev: () => void;
  nextLabel: string;
  onNext: () => void;
  nextHint?: string;
  nextVariant?: 'teal' | 'yellow';
}

export const StepFooterNav: React.FC<StepFooterNavProps> = ({
  prevLabel,
  onPrev,
  nextLabel,
  onNext,
  nextHint,
  nextVariant = 'teal',
}) => {
  return (
    <div className="mt-6 pt-5 border-t border-[#E5F1F5] flex flex-wrap items-center justify-between gap-3">
      <button
        type="button"
        onClick={onPrev}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-[#DDEEF3] bg-[#F4FBFD] text-[13px] font-semibold text-[#1B1B4B] hover:bg-[#E3F5FA] hover:border-[#B5E4F1] transition-colors whitespace-nowrap"
      >
        <ArrowLeft className="w-4 h-4 text-[#167F7B]" />
        <span>{prevLabel}</span>
      </button>

      <div className="flex flex-wrap items-center gap-3 ml-auto">
        {nextHint && (
          <span className="text-[12px] text-[#757E96] hidden sm:inline">
            {nextHint}
          </span>
        )}
        <button
          type="button"
          onClick={onNext}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-bold transition-all shadow-xs whitespace-nowrap ${
            nextVariant === 'yellow'
              ? 'bg-[#F9DE6C] text-[#1B1B4B] hover:bg-[#F3D34F]'
              : 'bg-[#1F9B96] text-white hover:bg-[#167F7B]'
          }`}
        >
          <span>{nextLabel}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
