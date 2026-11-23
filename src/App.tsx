import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Menu, Search } from 'lucide-react';
import {
  BASE_SYSTEM_OVERLAYS,
  buildDefaultTemplates,
  createInitialEvents,
} from './data/initialData';
import {
  BankSyncUpdate,
  EventMetadata,
  NavTab,
  OverlayBlock,
  Recipient,
  SavedEventRecord,
  TemplateImages,
  WorkflowStatusSummary,
} from './types';
import {
  StoredSystemDefault,
  clearSystemDefault,
  clearStudioDraft,
  loadSystemDefaultSync,
  loadSystemDefaultFromIdb,
  loadStudioDraft,
  saveSystemDefaultSync,
  saveSystemDefaultToIdb,
  saveStudioDraft,
  applyRsvpSubmissionToStorage,
} from './utils/storage';
import {
  buildSafePdfFilename,
  generateBatchZip,
  generateSingleRecipientPdf,
  triggerBlobDownload,
} from './utils/pdfEngine';
import {
  RSVP_BROADCAST_CHANNEL,
  RsvpSubmissionMessage,
  parseRsvpParams,
} from './utils/rsvp';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { EventSetupView } from './components/EventSetupView';
import { LayoutEditorView } from './components/LayoutEditorView';
import { GuestListView } from './components/GuestListView';
import { BatchQueueView } from './components/BatchQueueView';
import { WorkflowStepperBar } from './components/WorkflowStepperBar';
import { InvitationPreviewModal } from './components/InvitationPreviewModal';
import { GuestRsvpPage } from './components/GuestRsvpPage';
import { FloatingToast } from './components/UiPolish';
import { IconBadge } from './components/BrandIcon';

function stripSalinanSuffix(name: string): string {
  const stripped = name.replace(/(?:\s*\(Salinan(?:\s+\d+)?\))+$/gi, '').trim();
  return stripped || name.trim();
}

function buildUniqueCopyName(sourceName: string, existingNames: Set<string>): string {
  const baseName = stripSalinanSuffix(sourceName);
  const firstCandidate = `${baseName} (Salinan)`;
  if (!existingNames.has(firstCandidate.toLowerCase())) {
    return firstCandidate;
  }
  let counter = 2;
  while (existingNames.has(`${baseName} (Salinan ${counter})`.toLowerCase())) {
    counter += 1;
  }
  return `${baseName} (Salinan ${counter})`;
}

function sanitizeStackedDuplicateEventNames(
  list: SavedEventRecord[]
): SavedEventRecord[] {
  const seen = new Set<string>();
  return list.map((ev) => {
    const rawName = ev.metadata.eventName || '';
    const hasStackedSalinan = /(?:\s*\(Salinan(?:\s+\d+)?\)){2,}$/i.test(rawName);
    if (!hasStackedSalinan) {
      seen.add(rawName.trim().toLowerCase());
      return ev;
    }
    const cleanName = buildUniqueCopyName(rawName, seen);
    seen.add(cleanName.toLowerCase());
    return {
      ...ev,
      metadata: {
        ...ev.metadata,
        eventName: cleanName,
      },
    };
  });
}

export default function App() {
  const [urlRsvpPayload] = useState(() =>
    typeof window !== 'undefined' ? parseRsvpParams(window.location.search) : null
  );
  const [simulatedRsvpRecipient, setSimulatedRsvpRecipient] =
    useState<Recipient | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [events, setEvents] = useState<SavedEventRecord[]>(() =>
    createInitialEvents()
  );
  const [activeEventId, setActiveEventId] = useState<string>(
    'evt-default-active'
  );

  const activeEvent = useMemo(
    () => events.find((ev) => ev.id === activeEventId) ?? events[0],
    [events, activeEventId]
  );

  const metadata = activeEvent.metadata;
  const templates = activeEvent.templates;
  const overlays = activeEvent.overlays;
  const recipients = activeEvent.recipients;

  const updateActiveEvent = useCallback(
    (updater: (current: SavedEventRecord) => SavedEventRecord) => {
      setEvents((prev) =>
        prev.map((ev) =>
          ev.id === activeEvent.id
            ? { ...updater(ev), updatedAt: Date.now() }
            : ev
        )
      );
    },
    [activeEvent.id]
  );

  const setMetadata = useCallback(
    (next: EventMetadata) => {
      updateActiveEvent((ev) => ({ ...ev, metadata: next }));
    },
    [updateActiveEvent]
  );

  const setTemplates = useCallback(
    (next: TemplateImages) => {
      updateActiveEvent((ev) => ({ ...ev, templates: next }));
    },
    [updateActiveEvent]
  );

  const setOverlays = useCallback(
    (next: OverlayBlock[]) => {
      updateActiveEvent((ev) => ({ ...ev, overlays: next }));
    },
    [updateActiveEvent]
  );

  const setRecipients = useCallback(
    (updater: Recipient[] | ((prev: Recipient[]) => Recipient[])) => {
      updateActiveEvent((ev) => ({
        ...ev,
        recipients:
          typeof updater === 'function' ? updater(ev.recipients) : updater,
      }));
    },
    [updateActiveEvent]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('Semua');

  const [previewRecipientId, setPreviewRecipientId] = useState<string>(
    () => activeEvent.recipients[0]?.id ?? ''
  );
  const [modalTarget, setModalTarget] = useState<{
    recipientId: string;
    fallback: Recipient;
  } | null>(null);
  const [modalPreviewPage, setModalPreviewPage] = useState<1 | 2>(1);
  const [systemDefaultState, setSystemDefaultState] =
    useState<StoredSystemDefault | null>(() => loadSystemDefaultSync());
  const systemDefaultOverlays = systemDefaultState?.overlays ?? null;

  // Derive live modalRecipient so edits/bank-syncs appear immediately in Full Preview
  const modalRecipient = useMemo<Recipient | null>(() => {
    if (!modalTarget) return null;
    return (
      recipients.find((r) => r.id === modalTarget.recipientId) ??
      modalTarget.fallback
    );
  }, [modalTarget, recipients]);

  // Keep previewRecipientId valid whenever active event's recipients change
  useEffect(() => {
    if (recipients.length === 0) {
      if (previewRecipientId !== '') setPreviewRecipientId('');
      return;
    }
    if (!recipients.some((r) => r.id === previewRecipientId)) {
      setPreviewRecipientId(recipients[0].id);
    }
  }, [recipients, previewRecipientId]);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
  const [batchProcessedCount, setBatchProcessedCount] = useState(0);
  const [batchTotalCount, setBatchTotalCount] = useState(0);
  const [currentGeneratingName, setCurrentGeneratingName] = useState('');

  const [toast, setToast] = useState<{
    id: number;
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    workspaceScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    if (typeof window !== 'undefined' && window.scrollY > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [activeTab]);

  const zipResultRef = useRef<{ blob: Blob; filename: string } | null>(null);
  const pdfCacheRef = useRef<Map<string, { filename: string; bytes: Uint8Array }>>(
    new Map()
  );
  const [hasReadyZip, setHasReadyZip] = useState(false);
  const draftLoadedRef = useRef(false);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' = 'success') => {
      setToast({ id: Date.now() + Math.random(), message, type });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Global keyboard shortcuts: '/' focuses search, 'Escape' closes preview modal or clears search focus
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (modalTarget) {
          setModalTarget(null);
          return;
        }
        if (document.activeElement === searchInputRef.current) {
          searchInputRef.current?.blur();
        }
        return;
      }
      if (
        e.key === '/' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          (document.activeElement as HTMLElement | null)?.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalTarget]);

  // Load persisted multi-event draft & full System Default from IndexedDB on mount
  useEffect(() => {
    let active = true;
    Promise.all([loadStudioDraft(), loadSystemDefaultFromIdb()])
      .then(([draft, idbDefault]) => {
        if (!active) return;

        // Reconcile System Default across localStorage & IndexedDB (prefer IDB on tie for full templates)
        const lsDefault = loadSystemDefaultSync();
        let effectiveDefault: StoredSystemDefault | null = lsDefault;
        if (
          idbDefault &&
          (!lsDefault || idbDefault.savedAt >= lsDefault.savedAt)
        ) {
          effectiveDefault = idbDefault;
          saveSystemDefaultSync(idbDefault);
        } else if (lsDefault && !idbDefault) {
          void saveSystemDefaultToIdb(lsDefault);
        }

        if (effectiveDefault) {
          setSystemDefaultState(effectiveDefault);
        }

        if (draft && draft.events.length > 0) {
          const validActive =
            draft.events.find((e) => e.id === draft.activeEventId) ??
            draft.events[0];

          const shouldApplyDefault =
            Boolean(effectiveDefault) &&
            effectiveDefault!.savedAt >= validActive.updatedAt;

          const nextEvents = shouldApplyDefault
            ? draft.events.map((ev) => {
                if (ev.id !== validActive.id) return ev;
                const nextTemplates = effectiveDefault!.templates
                  ? { ...effectiveDefault!.templates }
                  : ev.templates;
                const singlePageOnly =
                  nextTemplates.pageCount === 1 || !nextTemplates.page2DataUrl;
                return {
                  ...ev,
                  metadata: effectiveDefault!.metadata
                    ? { ...effectiveDefault!.metadata }
                    : ev.metadata,
                  templates: nextTemplates,
                  overlays: effectiveDefault!.overlays.map((o) => ({
                    ...o,
                    page: singlePageOnly ? 1 : o.page,
                  })),
                };
              })
            : draft.events;

          setEvents(sanitizeStackedDuplicateEventNames(nextEvents));
          setActiveEventId(validActive.id);
          if (validActive.recipients[0]) {
            setPreviewRecipientId(validActive.recipients[0].id);
          }
        } else if (effectiveDefault) {
          const fresh = createInitialEvents(effectiveDefault);
          setEvents(fresh);
          setActiveEventId(fresh[0].id);
          if (fresh[0]?.recipients[0]) {
            setPreviewRecipientId(fresh[0].recipients[0].id);
          }
        }
      })
      .finally(() => {
        draftLoadedRef.current = true;
      });
    return () => {
      active = false;
    };
  }, []);

  // Debounced auto-save to IndexedDB whenever events or activeEventId change (Admin mode only)
  useEffect(() => {
    if (urlRsvpPayload || !draftLoadedRef.current) return;
    const timer = setTimeout(() => {
      saveStudioDraft({
        activeEventId,
        events,
        updatedAt: Date.now(),
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [urlRsvpPayload, activeEventId, events]);

  // Listen to BroadcastChannel for live cross-tab RSVP submissions
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(RSVP_BROADCAST_CHANNEL);
    channel.onmessage = (event: MessageEvent<RsvpSubmissionMessage>) => {
      const msg = event.data;
      if (!msg || msg.type !== 'rsvp_updated') return;
      setEvents((prev) =>
        prev.map((ev) => {
          if (msg.eventId && ev.id !== msg.eventId) return ev;
          return {
            ...ev,
            recipients: ev.recipients.map((rec) =>
              rec.invitationCode.toLowerCase() === msg.invitationCode.toLowerCase()
                ? {
                    ...rec,
                    rsvpStatus: msg.rsvpStatus,
                    rsvpRepresentative: msg.rsvpRepresentative,
                    rsvpNote: msg.rsvpNote,
                    rsvpAt: msg.rsvpAt,
                  }
                : rec
            ),
            updatedAt: Date.now(),
          };
        })
      );
      showToast(`Konfirmasi RSVP diterima untuk kode ${msg.invitationCode}.`);
    };
    return () => channel.close();
  }, [showToast]);

  // Clear cached PDFs whenever active event design/metadata/overlays change
  useEffect(() => {
    pdfCacheRef.current.clear();
    zipResultRef.current = null;
    setHasReadyZip(false);
  }, [activeEventId, metadata, templates, overlays]);

  const availableGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const rec of recipients) {
      const g = rec.group?.trim() || 'Lainnya / Manual';
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  }, [recipients]);

  const filteredRecipients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return recipients.filter((rec) => {
      const recGroup = rec.group?.trim() || 'Lainnya / Manual';
      const matchesGroup = groupFilter === 'Semua' || recGroup === groupFilter;
      const matchesSearch =
        !q ||
        rec.recipientName.toLowerCase().includes(q) ||
        rec.institution.toLowerCase().includes(q) ||
        rec.invitationCode.toLowerCase().includes(q) ||
        recGroup.toLowerCase().includes(q);
      return matchesGroup && matchesSearch;
    });
  }, [recipients, searchQuery, groupFilter]);

  const readyCount = useMemo(
    () => recipients.filter((r) => r.status !== 'generated').length,
    [recipients]
  );

  const workflowStatus = useMemo<WorkflowStatusSummary>(() => {
    const setupReady = Boolean(
      metadata.eventName.trim() && templates.page1DataUrl
    );
    const recipientCount = recipients.length;
    const guestsReady = recipientCount > 0;
    const visibleOverlayCount = overlays.filter((o) => o.visible).length;
    const layoutReady = visibleOverlayCount > 0 && Boolean(templates.page1DataUrl);
    const generatedCount = recipients.filter((r) => r.status === 'generated').length;
    const confirmedCount = recipients.filter(
      (r) => r.rsvpStatus === 'attending' || r.rsvpStatus === 'represented'
    ).length;
    const batchDone = recipientCount > 0 && generatedCount === recipientCount;

    let recommendedStep: Exclude<NavTab, 'dashboard'> = 'layout';
    let recommendedStepLabel = 'Tahap 3: Atur Tata Letak';

    if (!setupReady) {
      recommendedStep = 'setup';
      recommendedStepLabel = 'Tahap 1: Lengkapi Info & Template';
    } else if (!guestsReady) {
      recommendedStep = 'guests';
      recommendedStepLabel = 'Tahap 2: Isi Daftar Penerima';
    } else if (generatedCount === 0) {
      recommendedStep = 'layout';
      recommendedStepLabel = 'Tahap 3: Atur Tata Letak & Pratinjau';
    } else {
      recommendedStep = 'batch';
      recommendedStepLabel = 'Tahap 4: Generate PDF & Laporan';
    }

    return {
      setupReady,
      guestsReady,
      layoutReady,
      batchDone,
      recipientCount,
      generatedCount,
      confirmedCount,
      visibleOverlayCount,
      pageCount: templates.pageCount,
      recommendedStep,
      recommendedStepLabel,
    };
  }, [metadata.eventName, templates.page1DataUrl, templates.pageCount, recipients, overlays]);

  // Event History Handlers
  const handleSelectEvent = (eventId: string) => {
    const found = events.find((e) => e.id === eventId);
    if (!found) return;
    setActiveEventId(found.id);
    setGroupFilter('Semua');
    setPreviewRecipientId(found.recipients[0]?.id ?? '');
    showToast(`Membuka proyek "${found.metadata.eventName}"`);
  };

  const handleCreateEvent = (newMeta: EventMetadata) => {
    const nextTemplates = buildDefaultTemplates(newMeta, systemDefaultState);
    const singlePageOnly =
      nextTemplates.pageCount === 1 || !nextTemplates.page2DataUrl;
    const now = Date.now();
    const newId = `evt-${now}`;

    const newRecord: SavedEventRecord = {
      id: newId,
      metadata: { ...newMeta },
      templates: nextTemplates,
      overlays: (systemDefaultOverlays ?? BASE_SYSTEM_OVERLAYS).map((o) => ({
        ...o,
        page: singlePageOnly ? 1 : o.page,
      })),
      recipients: [],
      isCompleted: false,
      createdAt: now,
      updatedAt: now,
    };

    setEvents((prev) => [newRecord, ...prev]);
    setActiveEventId(newId);
    setPreviewRecipientId('');
    setActiveTab('setup');
    showToast(
      `Event baru "${newMeta.eventName}" dibuat — silakan lengkapi template undangan di Tahap 1.`
    );
  };

  const handleDuplicateEvent = (eventId: string) => {
    const source = events.find((e) => e.id === eventId);
    if (!source) return;
    const now = Date.now();
    const copyId = `evt-copy-${now}`;

    const existingNames = new Set(
      events.map((e) => e.metadata.eventName.trim().toLowerCase())
    );
    const nextCopyName = buildUniqueCopyName(
      source.metadata.eventName,
      existingNames
    );

    const cloned: SavedEventRecord = {
      id: copyId,
      metadata: {
        ...source.metadata,
        eventName: nextCopyName,
      },
      templates: { ...source.templates },
      overlays: source.overlays.map((o) => ({ ...o })),
      recipients: source.recipients.map((r, idx) => ({
        ...r,
        id: `rec-copy-${now}-${idx}`,
        status: 'ready',
        generatedAt: undefined,
      })),
      isCompleted: false,
      createdAt: now,
      updatedAt: now,
    };

    setEvents((prev) => [cloned, ...prev]);
    setActiveEventId(copyId);
    setPreviewRecipientId(cloned.recipients[0]?.id ?? '');
    showToast(`Berhasil menduplikat "${source.metadata.eventName}".`);
  };

  const handleToggleEventCompleted = (eventId: string) => {
    setEvents((prev) =>
      prev.map((ev) =>
        ev.id === eventId
          ? { ...ev, isCompleted: !ev.isCompleted, updatedAt: Date.now() }
          : ev
      )
    );
  };

  const handleDeleteEvent = (eventId: string) => {
    if (events.length <= 1) return;
    const remaining = events.filter((e) => e.id !== eventId);
    setEvents(remaining);
    if (activeEventId === eventId && remaining[0]) {
      setActiveEventId(remaining[0].id);
      setPreviewRecipientId(remaining[0].recipients[0]?.id ?? '');
    }
    showToast('Event dihapus dari daftar riwayat.');
  };

  const handleDownloadSinglePdf = async (recipient: Recipient) => {
    setDownloadingId(recipient.id);
    try {
      const cached = pdfCacheRef.current.get(recipient.id);
      let bytes: Uint8Array;
      let filename: string;

      if (cached) {
        bytes = cached.bytes;
        filename = cached.filename;
      } else {
        bytes = await generateSingleRecipientPdf({
          eventId: activeEvent.id,
          metadata,
          templates,
          overlays,
          recipient,
        });
        filename = buildSafePdfFilename(
          metadata.eventName,
          recipient.recipientName,
          recipient.institution
        );
        pdfCacheRef.current.set(recipient.id, { filename, bytes });
      }

      triggerBlobDownload(bytes, filename, 'application/pdf');
      setRecipients((prev) =>
        prev.map((r) =>
          r.id === recipient.id
            ? { ...r, status: 'generated', generatedAt: Date.now() }
            : r
        )
      );
      showToast(`Berhasil mengunduh ${filename}`);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal membuat berkas PDF.',
        'error'
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const handleStartBatchExport = async () => {
    const targets = filteredRecipients.length > 0 ? filteredRecipients : recipients;
    if (targets.length === 0 || isGeneratingBatch) return;

    setActiveTab('batch');
    setIsGeneratingBatch(true);
    setBatchProcessedCount(0);
    setBatchTotalCount(targets.length);
    setHasReadyZip(false);

    try {
      const { zipBlob, zipFilename } = await generateBatchZip({
        eventId: activeEvent.id,
        metadata,
        templates,
        overlays,
        recipients: targets,
        onItemStart: (recipientId, idx) => {
          const r = targets[idx];
          setCurrentGeneratingName(r?.recipientName ?? '');
          setRecipients((prev) =>
            prev.map((item) =>
              item.id === recipientId ? { ...item, status: 'generating' } : item
            )
          );
        },
        onItemDone: (recipientId, filename, bytes, idx) => {
          pdfCacheRef.current.set(recipientId, { filename, bytes });
          setBatchProcessedCount(idx + 1);
          setRecipients((prev) =>
            prev.map((item) =>
              item.id === recipientId
                ? { ...item, status: 'generated', generatedAt: Date.now() }
                : item
            )
          );
        },
      });

      zipResultRef.current = { blob: zipBlob, filename: zipFilename };
      setHasReadyZip(true);
      triggerBlobDownload(zipBlob, zipFilename, 'application/zip');
      showToast(`${targets.length} PDF individual berhasil dikemas ke ${zipFilename}`);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Terjadi kesalahan saat ekspor batch ZIP.',
        'error'
      );
    } finally {
      setIsGeneratingBatch(false);
    }
  };

  const handleDownloadZipArchive = () => {
    if (!zipResultRef.current) return;
    triggerBlobDownload(
      zipResultRef.current.blob,
      zipResultRef.current.filename,
      'application/zip'
    );
    showToast(`Mengunduh arsip ${zipResultRef.current.filename}`);
  };

  const handleSaveAsDefaultSystem = async () => {
    const savedAt = Date.now();
    const saved = saveSystemDefaultSync({
      overlays: overlays.map((o) => ({ ...o })),
      metadata: { ...metadata },
      templates: { ...templates },
      savedAt,
    });
    setSystemDefaultState(saved);
    await saveSystemDefaultToIdb(saved);

    // Flush active draft immediately so refreshing right away keeps everything in sync
    const nextEvents = events.map((ev) =>
      ev.id === activeEvent.id
        ? {
            ...ev,
            metadata: { ...metadata },
            templates: { ...templates },
            overlays: saved.overlays.map((o) => ({ ...o })),
            updatedAt: savedAt,
          }
        : ev
    );
    setEvents(nextEvents);
    await saveStudioDraft({
      activeEventId,
      events: nextEvents,
      updatedAt: savedAt,
    });

    showToast(
      'Kondisi & pengaturan saat ini disimpan sebagai Default Sistem.'
    );
  };

  const handleCopySystemDefaultJson = async () => {
    const exportPayload = {
      metadata: { ...metadata },
      templatesInfo: {
        pageCount: templates.pageCount,
        page1Width: templates.page1Width,
        page1Height: templates.page1Height,
        hasPage2: Boolean(templates.page2DataUrl),
        page2Width: templates.page2Width,
        page2Height: templates.page2Height,
      },
      overlays: overlays.map((o) => ({ ...o })),
    };
    const jsonText = JSON.stringify(exportPayload, null, 2);

    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(jsonText);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      try {
        const ta = document.createElement('textarea');
        ta.value = jsonText;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        copied = false;
      }
    }

    if (copied) {
      showToast('JSON pengaturan saat ini disalin ke clipboard.');
    } else {
      showToast('Gagal menyalin JSON ke clipboard.', 'error');
    }
  };

  const handleClearSystemDefault = async () => {
    await clearSystemDefault();
    setSystemDefaultState(null);
    showToast('Default Sistem tersimpan dihapus.');
  };

  const handleResetOverlays = () => {
    const source =
      systemDefaultOverlays && systemDefaultOverlays.length > 0
        ? systemDefaultOverlays
        : BASE_SYSTEM_OVERLAYS;
    const singlePageOnly =
      templates.pageCount === 1 || !templates.page2DataUrl;
    setOverlays(
      source.map((o) => ({
        ...o,
        page: singlePageOnly ? 1 : o.page,
      }))
    );
    showToast(
      systemDefaultOverlays
        ? 'Tata letak dikembalikan ke Default Sistem Anda.'
        : 'Tata letak dikembalikan ke posisi awal.'
    );
  };

  const handleResetWorkspace = async () => {
    await clearStudioDraft();
    const initial = createInitialEvents(systemDefaultState, {
      emptyRecipients: true,
    });
    const now = Date.now();
    setEvents(initial);
    setActiveEventId(initial[0].id);
    setPreviewRecipientId('');
    setSearchQuery('');
    setGroupFilter('Semua');
    pdfCacheRef.current.clear();
    zipResultRef.current = null;
    setHasReadyZip(false);
    await saveStudioDraft({
      activeEventId: initial[0].id,
      events: initial,
      updatedAt: now,
    });
    showToast('Draf direset: seluruh daftar penerima undangan telah dikosongkan.');
  };

  const handleAddRecipient = (data: Omit<Recipient, 'id' | 'status'>) => {
    const newRec: Recipient = {
      ...data,
      id: `rec-${Date.now()}`,
      status: 'ready',
    };
    setRecipients((prev) => [newRec, ...prev]);
    setPreviewRecipientId(newRec.id);
    showToast(`Penerima "${newRec.recipientName}" ditambahkan.`);
  };

  const handleUpdateRecipient = (id: string, patch: Partial<Recipient>) => {
    setRecipients((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
    pdfCacheRef.current.delete(id);
    showToast('Data penerima diperbarui.');
  };

  const handleDeleteRecipient = (id: string) => {
    setRecipients((prev) => prev.filter((r) => r.id !== id));
    pdfCacheRef.current.delete(id);
    showToast('Penerima dihapus dari daftar.');
  };

  const handleBulkDeleteByGroup = (targetGroup: string) => {
    if (targetGroup === 'Semua') {
      setRecipients([]);
      pdfCacheRef.current.clear();
      setPreviewRecipientId('');
      showToast('Seluruh daftar penerima undangan pada event ini dikosongkan.');
      return;
    }
    setRecipients((prev) =>
      prev.filter((r) => (r.group?.trim() || 'Lainnya / Manual') !== targetGroup)
    );
    setGroupFilter('Semua');
    pdfCacheRef.current.clear();
    showToast(`Kelompok "${targetGroup}" dihapus dari daftar penerima.`);
  };

  const handleApplyPdfSelection = (
    selected: Recipient[],
    mode: 'append' | 'replace'
  ) => {
    if (selected.length === 0) return;
    const stamp = Date.now();

    if (mode === 'replace') {
      const fresh = selected.map((r, i) => ({
        ...r,
        id: `pdf-pick-${stamp}-${i}`,
        status: 'ready' as const,
      }));
      setRecipients(fresh);
      setGroupFilter('Semua');
      pdfCacheRef.current.clear();
      if (fresh[0]) setPreviewRecipientId(fresh[0].id);
      showToast(`${fresh.length} penerima terpilih berhasil dipasang ke daftar undangan.`);
      return;
    }

    const existingKeys = new Set(
      recipients.map(
        (r) =>
          `${r.recipientName.toLowerCase()}||${r.institution.toLowerCase()}||${r.group ?? ''}`
      )
    );
    const toAdd = selected
      .filter(
        (r) =>
          !existingKeys.has(
            `${r.recipientName.toLowerCase()}||${r.institution.toLowerCase()}||${r.group ?? ''}`
          )
      )
      .map((r, i) => ({
        ...r,
        id: `pdf-pick-${stamp}-${i}`,
        status: 'ready' as const,
      }));

    if (toAdd.length === 0) {
      showToast('Semua penerima yang dicentang sudah ada di dalam daftar saat ini.');
      return;
    }

    setRecipients((prev) => [...prev, ...toAdd]);
    const skipped = selected.length - toAdd.length;
    showToast(
      skipped > 0
        ? `${toAdd.length} penerima baru ditambahkan (${skipped} sudah ada di daftar).`
        : `${toAdd.length} penerima terpilih berhasil ditambahkan ke daftar.`
    );
  };

  const handleSyncBankUpdates = useCallback(
    (updates: BankSyncUpdate[]): number => {
      if (updates.length === 0) return 0;

      const byCode = new Map<string, BankSyncUpdate['next']>();
      const byIdentity = new Map<string, BankSyncUpdate['next']>();
      for (const u of updates) {
        if (u.previousKey.invitationCode) {
          byCode.set(u.previousKey.invitationCode.trim().toLowerCase(), u.next);
        }
        const identity = `${u.previousKey.recipientName.trim().toLowerCase()}||${u.previousKey.institution.trim().toLowerCase()}||${(u.previousKey.group ?? '').trim().toLowerCase()}`;
        byIdentity.set(identity, u.next);
      }

      let matchedCount = 0;
      const updatedIds: string[] = [];

      const nextRecipients = recipients.map((rec) => {
        const codeKey = rec.invitationCode.trim().toLowerCase();
        const identityKey = `${rec.recipientName.trim().toLowerCase()}||${rec.institution.trim().toLowerCase()}||${(rec.group ?? '').trim().toLowerCase()}`;
        const patch = byIdentity.get(identityKey) ?? byCode.get(codeKey);
        if (!patch) return rec;

        matchedCount += 1;
        updatedIds.push(rec.id);
        return {
          ...rec,
          salutation: patch.salutation,
          recipientName: patch.recipientName,
          institution: patch.institution,
          placeLabel: patch.placeLabel,
          group: patch.group,
        };
      });

      if (matchedCount > 0) {
        setRecipients(nextRecipients);
        updatedIds.forEach((id) => pdfCacheRef.current.delete(id));
        zipResultRef.current = null;
        setHasReadyZip(false);
      }

      return matchedCount;
    },
    [recipients, setRecipients]
  );

  const handleBulkImport = (imported: Recipient[], mode: 'append' | 'replace') => {
    if (mode === 'replace') {
      setRecipients(imported);
      setGroupFilter('Semua');
      if (imported[0]) setPreviewRecipientId(imported[0].id);
    } else {
      setRecipients((prev) => [...imported, ...prev]);
    }
    showToast(`${imported.length} penerima berhasil diimpor ke daftar.`);
  };

  const handlePreviewRecipient = (recipient: Recipient, page: 1 | 2 = 1) => {
    setPreviewRecipientId(recipient.id);
    setModalPreviewPage(page);
    setModalTarget({ recipientId: recipient.id, fallback: recipient });
  };

  const handleRsvpSubmit = async (
    eventId: string,
    invitationCode: string,
    data: {
      status: 'attending' | 'represented' | 'declined';
      representative?: string;
      note?: string;
    }
  ) => {
    const rsvpAt = Date.now();
    setEvents((prev) =>
      prev.map((ev) => {
        if (eventId && ev.id !== eventId) return ev;
        return {
          ...ev,
          recipients: ev.recipients.map((rec) =>
            rec.invitationCode.toLowerCase() === invitationCode.toLowerCase()
              ? {
                  ...rec,
                  rsvpStatus: data.status,
                  rsvpRepresentative: data.representative,
                  rsvpNote: data.note,
                  rsvpAt,
                }
              : rec
          ),
          updatedAt: rsvpAt,
        };
      })
    );

    await applyRsvpSubmissionToStorage(eventId, invitationCode, {
      rsvpStatus: data.status,
      rsvpRepresentative: data.representative,
      rsvpNote: data.note,
      rsvpAt,
    });

    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(RSVP_BROADCAST_CHANNEL);
      const msg: RsvpSubmissionMessage = {
        type: 'rsvp_updated',
        eventId,
        invitationCode,
        rsvpStatus: data.status,
        rsvpRepresentative: data.representative,
        rsvpNote: data.note,
        rsvpAt,
      };
      ch.postMessage(msg);
      ch.close();
    }

    if (simulatedRsvpRecipient) {
      setSimulatedRsvpRecipient((prev) =>
        prev
          ? {
              ...prev,
              rsvpStatus: data.status,
              rsvpRepresentative: data.representative,
              rsvpNote: data.note,
              rsvpAt,
            }
          : null
      );
      showToast(`Konfirmasi kehadiran "${simulatedRsvpRecipient.recipientName}" tercatat.`);
    }
  };

  // Direct Guest Self-RSVP View when opened via QR Code URL (?rsvp=1...)
  if (urlRsvpPayload) {
    const matchedRecipient = events
      .find((e) => !urlRsvpPayload.eventId || e.id === urlRsvpPayload.eventId)
      ?.recipients.find(
        (r) =>
          r.invitationCode.toLowerCase() ===
          urlRsvpPayload.invitationCode.toLowerCase()
      );

    return (
      <MotionConfig reducedMotion="user">
        <GuestRsvpPage
          payload={urlRsvpPayload}
          initialStatus={matchedRecipient?.rsvpStatus}
          initialRepresentative={matchedRecipient?.rsvpRepresentative}
          initialNote={matchedRecipient?.rsvpNote}
          initialSubmittedAt={matchedRecipient?.rsvpAt}
          onSubmitRsvp={(data) =>
            handleRsvpSubmit(
              urlRsvpPayload.eventId,
              urlRsvpPayload.invitationCode,
              data
            )
          }
        />
      </MotionConfig>
    );
  }

  // In-App Simulation Mode when Admin tests a guest's QR RSVP page
  if (simulatedRsvpRecipient) {
    return (
      <MotionConfig reducedMotion="user">
        <GuestRsvpPage
          isSimulation
          payload={{
            eventId: activeEvent.id,
            invitationCode: simulatedRsvpRecipient.invitationCode,
            salutation: simulatedRsvpRecipient.salutation,
            recipientName: simulatedRsvpRecipient.recipientName,
            institution: simulatedRsvpRecipient.institution,
            eventName: metadata.eventName,
            date: metadata.date,
            time: metadata.time,
            location: metadata.location,
            organizer: metadata.organizer,
          }}
          initialStatus={simulatedRsvpRecipient.rsvpStatus}
          initialRepresentative={simulatedRsvpRecipient.rsvpRepresentative}
          initialNote={simulatedRsvpRecipient.rsvpNote}
          initialSubmittedAt={simulatedRsvpRecipient.rsvpAt}
          onBackToAdmin={() => setSimulatedRsvpRecipient(null)}
          onSubmitRsvp={(data) =>
            handleRsvpSubmit(
              activeEvent.id,
              simulatedRsvpRecipient.invitationCode,
              data
            )
          }
        />
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="relative min-h-screen w-full p-2.5 sm:p-5 lg:p-6 flex justify-center overflow-x-hidden"
        style={{ backgroundColor: 'var(--bg-canvas-outer)' }}
      >
        {/* Subtle decorative PinHome sky-line wave accents on the outer canvas */}
        <svg
          aria-hidden="true"
          viewBox="0 0 1440 900"
          preserveAspectRatio="none"
          className="pointer-events-none fixed inset-0 w-full h-full opacity-55"
        >
          <path
            d="M-60 660 C 260 640, 420 520, 720 530 C 1020 540, 1240 440, 1520 260"
            fill="none"
            stroke="#B4E4F2"
            strokeWidth="2.5"
          />
          <path
            d="M-80 240 C 220 320, 520 190, 920 240 C 1180 270, 1340 210, 1520 170"
            fill="none"
            stroke="#C3ECF7"
            strokeWidth="2"
          />
        </svg>

        {/* PinHome Signature All-Around Turquoise-Teal Frame */}
        <div
          className="relative z-10 w-full max-w-[1440px] rounded-[32px] p-2 sm:p-2.5 lg:p-3 shadow-[0_24px_60px_-20px_rgba(31,155,150,0.38)] flex min-h-[calc(100vh-3rem)]"
          style={{ backgroundColor: 'var(--bg-sidebar)' }}
        >
          {/* Left Vertical Sidebar */}
          <Sidebar
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            onGenerateAll={handleStartBatchExport}
            activeEventName={metadata.eventName}
            workflowStatus={workflowStatus}
            readyCount={readyCount}
            totalCount={recipients.length}
            isGeneratingBatch={isGeneratingBatch}
            mobileOpen={mobileMenuOpen}
            onCloseMobile={() => setMobileMenuOpen(false)}
          />

          {/* Main White Content Workspace */}
          <main
            className="flex-1 min-w-0 rounded-[26px] flex flex-col overflow-hidden shadow-[0_8px_28px_-12px_rgba(27,27,75,0.14)]"
            style={{ backgroundColor: 'var(--bg-surface-main)' }}
          >
            {/* Airy Minimalist PinHome Top Bar */}
            <header className="flex flex-wrap items-center justify-between gap-4 px-5 sm:px-8 py-4 border-b border-[#EDF5F8]">
              <div className="flex items-center gap-3 flex-1 min-w-[240px]">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  className="lg:hidden p-2 rounded-full border border-[#DDEEF3] text-[#1B1B4B] hover:bg-[#EDF8FB]"
                  aria-label="Buka menu navigasi"
                >
                  <Menu className="w-5 h-5" />
                </button>

                {activeTab === 'guests' || activeTab === 'batch' ? (
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-[#1B1B4B]/70 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari nama penerima, instansi, atau kode..."
                      className="w-full pl-10 pr-9 py-2 rounded-full border border-transparent bg-[#F4FBFD] text-[13px] text-[#1B1B4B] placeholder:text-[#8E96AB] focus:bg-white focus:border-[#BCE6F2] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]/30 transition-all"
                    />
                    {!searchQuery && (
                      <span
                        aria-hidden="true"
                        className="hidden sm:inline-flex items-center justify-center pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-mono text-[#9AA3B8]"
                      >
                        /
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="min-w-0">
                    <div className="font-display font-bold text-[15px] text-[#1B1B4B] truncate">
                      {activeTab === 'dashboard'
                        ? 'Beranda Event'
                        : activeTab === 'setup'
                          ? 'Tahap 1 · Persiapan Info & Template'
                          : 'Tahap 3 · Penataan Kanvas Undangan'}
                    </div>
                    <div className="text-[12px] text-[#757E96] truncate">
                      {activeTab === 'dashboard'
                        ? 'Pilih event aktif atau buat kegiatan baru untuk memulai alur undangan'
                        : `${metadata.eventName} · ${templates.pageCount} Halaman`}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleResetWorkspace}
                  title="Kosongkan seluruh daftar penerima & reset draf"
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#DDEEF3] bg-[#F4FBFD] text-[12px] font-semibold text-[#1B1B4B] hover:bg-[#E4F5FA] hover:border-[#BCE6F2] transition-colors whitespace-nowrap shrink-0"
                >
                  <IconBadge name="action-sync" size="xs" />
                  <span>Reset Draf</span>
                </button>
              </div>
            </header>

            {/* Dynamic Workspace Viewport with Persistent Stepper (Steps 1–4) & Smooth Tab Transition */}
            <div
              ref={workspaceScrollRef}
              className="flex-1 overflow-y-auto px-5 sm:px-7 py-6"
            >
              {activeTab !== 'dashboard' && (
                <WorkflowStepperBar
                  activeStep={activeTab}
                  metadata={metadata}
                  workflowStatus={workflowStatus}
                  onSelectTab={setActiveTab}
                />
              )}

              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  {activeTab === 'dashboard' && (
                    <DashboardView
                      eventId={activeEvent.id}
                      metadata={metadata}
                      templates={templates}
                      overlays={overlays}
                      recipients={recipients}
                      filteredRecipients={filteredRecipients}
                      previewRecipientId={previewRecipientId}
                      onSelectPreviewRecipient={setPreviewRecipientId}
                      events={events}
                      activeEventId={activeEvent.id}
                      workflowStatus={workflowStatus}
                      onSelectEvent={handleSelectEvent}
                      onCreateEvent={handleCreateEvent}
                      onDuplicateEvent={handleDuplicateEvent}
                      onToggleEventCompleted={handleToggleEventCompleted}
                      onDeleteEvent={handleDeleteEvent}
                      onNavigate={setActiveTab}
                      onPreviewRecipient={handlePreviewRecipient}
                      onNotify={showToast}
                      searchQuery={searchQuery}
                    />
                  )}

                  {activeTab === 'setup' && (
                    <EventSetupView
                      metadata={metadata}
                      onChangeMetadata={setMetadata}
                      templates={templates}
                      onChangeTemplates={setTemplates}
                      overlays={overlays}
                      onChangeOverlays={setOverlays}
                      recipientCount={recipients.length}
                      onNavigate={setActiveTab}
                    />
                  )}

                  {activeTab === 'guests' && (
                    <GuestListView
                      recipients={recipients}
                      filteredRecipients={filteredRecipients}
                      availableGroups={availableGroups}
                      groupFilter={groupFilter}
                      onSelectGroupFilter={setGroupFilter}
                      metadata={metadata}
                      onAddRecipient={handleAddRecipient}
                      onUpdateRecipient={handleUpdateRecipient}
                      onDeleteRecipient={handleDeleteRecipient}
                      onBulkDeleteByGroup={handleBulkDeleteByGroup}
                      onApplyPdfSelection={handleApplyPdfSelection}
                      onSyncBankUpdates={handleSyncBankUpdates}
                      onNotify={showToast}
                      onBulkImport={handleBulkImport}
                      onPreviewRecipient={handlePreviewRecipient}
                      onDownloadSinglePdf={handleDownloadSinglePdf}
                      onSimulateRsvp={setSimulatedRsvpRecipient}
                      onNavigate={setActiveTab}
                      downloadingId={downloadingId}
                      searchQuery={searchQuery}
                    />
                  )}

                  {activeTab === 'layout' && (
                    <LayoutEditorView
                      eventId={activeEvent.id}
                      metadata={metadata}
                      templates={templates}
                      overlays={overlays}
                      onChangeOverlays={setOverlays}
                      recipients={recipients}
                      previewRecipientId={previewRecipientId}
                      onSelectPreviewRecipient={setPreviewRecipientId}
                      onResetOverlays={handleResetOverlays}
                      onSaveAsDefault={handleSaveAsDefaultSystem}
                      onClearCustomDefault={handleClearSystemDefault}
                      onCopyDefaultJson={handleCopySystemDefaultJson}
                      hasCustomDefault={Boolean(systemDefaultState)}
                      customDefaultSavedAt={systemDefaultState?.savedAt ?? null}
                      onOpenFullPreview={handlePreviewRecipient}
                      onNavigate={setActiveTab}
                    />
                  )}

                  {activeTab === 'batch' && (
                    <BatchQueueView
                      metadata={metadata}
                      templates={templates}
                      recipients={filteredRecipients}
                      totalRecipientsCount={recipients.length}
                      availableGroups={availableGroups}
                      groupFilter={groupFilter}
                      onSelectGroupFilter={setGroupFilter}
                      isGeneratingBatch={isGeneratingBatch}
                      batchProcessedCount={batchProcessedCount}
                      batchTotalCount={batchTotalCount}
                      currentGeneratingName={currentGeneratingName}
                      hasReadyZip={hasReadyZip}
                      onStartBatchExport={handleStartBatchExport}
                      onDownloadZipArchive={handleDownloadZipArchive}
                      onDownloadSinglePdf={handleDownloadSinglePdf}
                      onPreviewRecipient={handlePreviewRecipient}
                      onNavigate={setActiveTab}
                      onNotify={showToast}
                      downloadingId={downloadingId}
                      searchQuery={searchQuery}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>

        {/* Floating Non-Shifting Toast Notification */}
        <FloatingToast toast={toast} onDismiss={() => setToast(null)} />

        {/* Instant Single-Recipient Full Preview Modal */}
        <InvitationPreviewModal
          eventId={activeEvent.id}
          recipient={modalRecipient}
          recipients={recipients}
          initialPage={modalPreviewPage}
          metadata={metadata}
          templates={templates}
          overlays={overlays}
          onClose={() => setModalTarget(null)}
          onSelectRecipient={(r) => {
            setModalTarget({ recipientId: r.id, fallback: r });
            setPreviewRecipientId(r.id);
          }}
          onDownloadPdf={handleDownloadSinglePdf}
          onSimulateRsvp={setSimulatedRsvpRecipient}
        />
      </div>
    </MotionConfig>
  );
}
