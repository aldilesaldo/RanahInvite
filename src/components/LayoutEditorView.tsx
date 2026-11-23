import React from 'react';
import {
  EventMetadata,
  NavTab,
  OverlayBlock,
  Recipient,
  TemplateImages,
} from '../types';
import { VisualCoordinateMapper } from './VisualCoordinateMapper';
import { BrandIcon, IconBadge } from './BrandIcon';
import { StepFooterNav } from './WorkflowStepperBar';

interface LayoutEditorViewProps {
  eventId: string;
  metadata: EventMetadata;
  templates: TemplateImages;
  overlays: OverlayBlock[];
  onChangeOverlays: (next: OverlayBlock[]) => void;
  recipients: Recipient[];
  previewRecipientId: string;
  onSelectPreviewRecipient: (id: string) => void;
  onResetOverlays: () => void;
  onSaveAsDefault: () => void | Promise<void>;
  onClearCustomDefault?: () => void | Promise<void>;
  onCopyDefaultJson?: () => void | Promise<void>;
  hasCustomDefault: boolean;
  customDefaultSavedAt?: number | null;
  onOpenFullPreview: (recipient: Recipient, page: 1 | 2) => void;
  onNavigate: (tab: NavTab) => void;
}

export const LayoutEditorView: React.FC<LayoutEditorViewProps> = ({
  eventId,
  metadata,
  templates,
  overlays,
  onChangeOverlays,
  recipients,
  previewRecipientId,
  onSelectPreviewRecipient,
  onResetOverlays,
  onSaveAsDefault,
  onClearCustomDefault,
  onCopyDefaultJson,
  hasCustomDefault,
  customDefaultSavedAt,
  onOpenFullPreview,
  onNavigate,
}) => {
  return (
    <div className="space-y-5">
      {/* Step Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EDF6F9] pb-4">
        <div className="flex items-center gap-3">
          <IconBadge name="nav-design" size="md" />
          <div>
            <div className="text-[11.5px] font-semibold text-[#1F9B96]">
              Tahap 3 dari 4
            </div>
            <h2 className="font-display font-bold text-[20px] text-[#1B1B4B] leading-tight">
              Tata Letak &amp; Pratinjau Kanvas
            </h2>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('setup')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#DDEEF3] bg-[#F4FBFD] text-[12.5px] font-semibold text-[#1B1B4B] hover:bg-[#E3F5FA] hover:border-[#B5E4F1] transition-colors whitespace-nowrap"
        >
          <BrandIcon name="action-upload" className="w-4 h-4 text-[#1F9B96]" />
          <span>Ganti Gambar Template</span>
        </button>
      </div>

      {/* Gentle contextual guidance if recipient list is still empty */}
      {recipients.length === 0 && (
        <div className="rounded-[20px] border border-[#F4DF89] bg-[#FFF7D6] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[12.5px] text-[#7A5B06]">
            Daftar penerima masih kosong. Pratinjau kanvas saat ini menampilkan nama contoh — tambahkan tamu di Tahap 2 agar Anda bisa mengecek panjang nama penerima asli.
          </div>
          <button
            type="button"
            onClick={() => onNavigate('guests')}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#1B1B4B] text-white text-[12px] font-semibold hover:bg-[#2A2A66] transition-colors whitespace-nowrap shrink-0"
          >
            <span>Isi Daftar Penerima</span>
          </button>
        </div>
      )}

      {/* Interactive Dual-Page Canvas & Properties Inspector */}
      <VisualCoordinateMapper
        eventId={eventId}
        metadata={metadata}
        templates={templates}
        overlays={overlays}
        onChangeOverlays={onChangeOverlays}
        recipients={recipients}
        previewRecipientId={previewRecipientId}
        onSelectPreviewRecipient={onSelectPreviewRecipient}
        onResetOverlays={onResetOverlays}
        onSaveAsDefault={onSaveAsDefault}
        onClearCustomDefault={onClearCustomDefault}
        onCopyDefaultJson={onCopyDefaultJson}
        hasCustomDefault={hasCustomDefault}
        customDefaultSavedAt={customDefaultSavedAt}
        onOpenFullPreview={onOpenFullPreview}
      />

      {/* Sequential Step Navigation */}
      <StepFooterNav
        prevLabel="Kembali: Daftar Penerima"
        onPrev={() => onNavigate('guests')}
        nextLabel="Lanjut: Generate PDF & Laporan"
        onNext={() => onNavigate('batch')}
        nextHint={
          recipients.length > 0
            ? `Siap merender ${recipients.length} undangan PDF`
            : 'Lanjut ke halaman ekspor PDF & laporan'
        }
        nextVariant="yellow"
      />
    </div>
  );
};
