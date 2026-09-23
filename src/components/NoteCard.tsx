import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, Pin, RotateCcw, X, Bell, ZoomIn, Pencil, Archive } from 'lucide-react';
import { toast } from 'sonner';
import DOMPurify from 'isomorphic-dompurify';
import NoteActionBar from './NoteActionBar';
import dynamic from 'next/dynamic';
import { useIsSmallScreen } from '@/lib/useIsSmallScreen';

const DrawingModal = dynamic(() => import('./DrawingModal'), { ssr: false });

export default function NoteCard({ note, onDelete, onUpdate, onRefresh, onEdit, onDuplicate, currentView, onDragStart, onDragOver, onDrop, searchQueryActive, isDragTarget, onDragEnter, availableLabels = [] }: any) {
  const { t, i18n } = useTranslation(['notes', 'common']);
  const isSmallScreen = useIsSmallScreen();
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [editingDrawingUrl, setEditingDrawingUrl] = useState<string | null>(null);
  const bgColor = note.color ? note.color : '';
  const rawBgImage = note.bg_image ? note.bg_image : '';
  const isTrash = currentView === 'trash';

  const bgStyle = rawBgImage
    ? (rawBgImage.startsWith('/') || rawBgImage.startsWith('http'))
      ? { backgroundImage: `url(${rawBgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { backgroundImage: rawBgImage }
    : {};

  const handleAction = (e: React.MouseEvent, action: Function) => { e.stopPropagation(); action(); };

  // Quick delete (moves to trash) with a temporary Undo option
  const handleQuickDelete = async () => {
    await fetch(`/api/notes/${note.id}`, { method: 'DELETE' });
    onRefresh();
    toast(t('notes:toasts.deleted'), {
      duration: 7000,
      action: {
        label: t('common:actions.undo'),
        onClick: async () => {
          await fetch(`/api/notes/${note.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deleted_at: null }),
          });
          onRefresh();
        },
      },
    });
  };

  // Quick archive with a temporary Undo option (only when archiving, not un-archiving)
  const handleQuickArchive = () => {
    const wasArchived = !!note.archived;
    onUpdate(note.id, { archived: !wasArchived, pinned: false });
    if (!wasArchived) {
      toast(t('notes:toasts.archived'), {
        duration: 7000,
        action: {
          label: t('common:actions.undo'),
          onClick: () => onUpdate(note.id, { archived: false }),
        },
      });
    }
  };

  const handleToggleCheckmark = async (itemId: string, currentStatus: boolean, e: React.ChangeEvent) => {
    e.stopPropagation();
    if (isTrash) return;
    await fetch(`/api/notes/${note.id}/checklist/${itemId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checked: !currentStatus }) });
    onRefresh();
  };

  const openLightbox = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    setLightboxUrl(url);
  };

  const isDrawingUrl = (url: string) => {
    const filename = url.split('/').pop() || '';
    return filename.startsWith('drawing-');
  };

  const handleAttachmentClick = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    if (isDrawingUrl(url)) {
      setEditingDrawingUrl(url);
    } else {
      setLightboxUrl(url);
    }
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: bgColor || (!rawBgImage ? 'var(--theme-surface)' : undefined),
    borderColor: 'var(--theme-border)',
    outlineColor: isDragTarget ? 'var(--theme-accent)' : undefined,
    ...bgStyle,
  };

  const CHECKLIST_PREVIEW_LIMIT = 5;
  const visibleItems = note.checklist_items?.slice(0, CHECKLIST_PREVIEW_LIMIT) ?? [];
  const hiddenCount = Math.max(0, (note.checklist_items?.length ?? 0) - CHECKLIST_PREVIEW_LIMIT);

  return (
    <>
      <div
        draggable={!isTrash && !searchQueryActive}
        onDragStart={(e) => onDragStart(e, note)}
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, note)}
        onDragEnter={() => onDragEnter?.(note.id)}
        onDragLeave={() => onDragEnter?.(null)}
        onClick={() => onEdit(note)}
        className={`group rounded-xl border shadow-sm mb-4 break-inside-avoid relative hover:shadow-lg transition-all cursor-pointer flex flex-col ${isDragTarget ? 'ring-2 scale-[1.02]' : ''}`}
        style={cardStyle}
      >
        {/* Attachment image — height capped so long images don't swallow the card */}
        {note.attachments && note.attachments.length > 0 && (
          <div className="relative w-full rounded-t-xl overflow-hidden bg-black/5" style={{ maxHeight: '200px' }}>
            <img
              src={note.attachments[0].url}
              alt="Note Attachment"
              className="w-full h-full object-cover block"
              style={{ maxHeight: '200px' }}
            />
            <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {isDrawingUrl(note.attachments[0].url) && !isTrash && (
                <button
                  onClick={(e) => handleAttachmentClick(e, note.attachments[0].url)}
                  className="p-1.5 bg-black/50 hover:bg-black/80 text-white rounded-full"
                  title="Zeichnung bearbeiten"
                >
                  <Pencil size={14} />
                </button>
              )}
              <button
                onClick={(e) => openLightbox(e, note.attachments[0].url)}
                className="p-1.5 bg-black/50 hover:bg-black/80 text-white rounded-full"
                title="Vollbild"
              >
                <ZoomIn size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Reminder indicator — absolutely positioned */}
        {note.reminder_at && !isTrash && (
          <div
            className="absolute top-3 left-3 opacity-70"
            style={{ color: 'var(--theme-accent)' }}
            title={t('reminders.tooltip', { date: new Date(note.reminder_at).toLocaleString(i18n.language) })}
          >
            <Bell size={14} />
          </div>
        )}

        {/* Content area — capped height so cards don't overflow the viewport */}
        <div className="px-4 pt-4 pb-2 overflow-hidden max-h-80">
          <h3 className="font-semibold text-lg mb-2" style={{ color: 'var(--theme-text)' }}>{note.title}</h3>

          {note.content_text && (
            <div
              className="text-sm mb-2 line-clamp-6 tiptap-preview"
              style={{ color: 'var(--theme-text-muted)' }}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(note.content_text || '') }}
            />
          )}

          {visibleItems.length > 0 && (
            <div className="space-y-1">
              {visibleItems.map((item: any) => (
                <div key={item.id} className="flex items-start gap-2 text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(e) => handleToggleCheckmark(item.id, item.checked, e)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 cursor-pointer"
                    disabled={isTrash}
                  />
                  <span className={item.checked ? 'line-through opacity-50' : ''}>{item.text}</span>
                </div>
              ))}
              {hiddenCount > 0 && (
                <p className="text-xs mt-1" style={{ color: 'var(--theme-text-muted)' }}>
                  + {hiddenCount} more…
                </p>
              )}
            </div>
          )}

          {note.labels && note.labels.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {note.labels.map((l: any) => (
                <span
                  key={l.id}
                  className="text-[10px] px-2 py-1 rounded-full"
                  style={l.color
                    ? { backgroundColor: l.color + '33', color: l.color, border: `1px solid ${l.color}55` }
                    : { backgroundColor: 'var(--theme-hover)', color: 'var(--theme-text-muted)' }}
                >
                  {l.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action bar — the color/list/labels/duplicate row only ever shows on
            desktop (hover-reveal, since touch has no hover state to rely on).
            On phones only the Delete/Archive/Pin quick-management group is
            shown, and it stays visible without needing a hover. */}
        <div className="px-4 pb-3 flex items-center justify-between gap-1" onClick={(e) => e.stopPropagation()}>
          {isTrash ? (
            <div className={`flex gap-2 transition-opacity ${isSmallScreen ? '' : 'opacity-0 group-hover:opacity-100'}`}>
              <ActionBtn onClick={e => handleAction(e, () => onDelete(note.id, true))} className="text-red-500"><Trash2 size={16} /></ActionBtn>
              <ActionBtn onClick={e => handleAction(e, () => onUpdate(note.id, { deleted_at: null }))} className="text-blue-500"><RotateCcw size={16} /></ActionBtn>
            </div>
          ) : (
            <>
              {!isSmallScreen && (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity min-w-0">
                  <NoteActionBar
                    selectedColor={note.color || ''}
                    selectedBgImage={note.bg_image || ''}
                    onColorChange={(c) => onUpdate(note.id, { color: c || null, bg_image: null })}
                    onBgImageChange={(img) => onUpdate(note.id, { bg_image: img || null, color: null })}
                    isListMode={false}
                    onToggleListMode={() => {}}
                    availableLabels={availableLabels}
                    selectedLabels={note.labels?.map((l: any) => l.id) || []}
                    onToggleLabel={(labelId: string) => {
                      const newLabelIds = note.labels?.map((l: any) => l.id) || [];
                      if (newLabelIds.includes(labelId)) {
                        onUpdate(note.id, { label_ids: newLabelIds.filter((id: string) => id !== labelId) });
                      } else {
                        onUpdate(note.id, { label_ids: [...newLabelIds, labelId] });
                      }
                    }}
                    onDuplicate={() => onDuplicate(note)}
                    iconSize={16}
                    compact={false}
                  />
                </div>
              )}

              {/* Quick management — Delete, Archive, Pin (left to right).
                  Always visible on phone (no hover to rely on); on desktop
                  it's hover-reveal like the rest of the card's controls, but
                  stays visible once a note is pinned so its state is always
                  obvious at a glance. Sized/spaced like the home page's
                  Checklist/Draw/Image icons so there's no risk of a mis-tap. */}
              <div
                className={`flex items-center gap-1 shrink-0 transition-opacity ${isSmallScreen ? 'ml-auto' : ''} ${isSmallScreen || note.pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
              >
                <QuickActionBtn onClick={e => handleAction(e, handleQuickDelete)} title={t('notes:tooltips.delete')}>
                  <Trash2 size={16} />
                </QuickActionBtn>
                <QuickActionBtn onClick={e => handleAction(e, handleQuickArchive)} title={t('notes:tooltips.archive')}>
                  <Archive size={16} />
                </QuickActionBtn>
                <QuickActionBtn
                  onClick={e => handleAction(e, () => onUpdate(note.id, { pinned: !note.pinned }))}
                  title={note.pinned ? t('notes:tooltips.unpin') : t('notes:tooltips.pin')}
                  active={note.pinned}
                >
                  <Pin size={16} className={note.pinned ? 'fill-current' : ''} />
                </QuickActionBtn>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full"
            onClick={() => setLightboxUrl(null)}
          >
            <X size={20} />
          </button>
          <img
            src={lightboxUrl}
            alt="Vollbild"
            className="max-w-full max-h-full rounded-xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Drawing edit modal */}
      {editingDrawingUrl && (
        <DrawingModal
          initialImageUrl={editingDrawingUrl}
          onClose={() => setEditingDrawingUrl(null)}
          onSave={(newUrl: string, replacingUrl?: string) => {
            const currentAttachments: string[] = note.attachments?.map((a: any) => a.url) || [];
            const updatedAttachments = replacingUrl
              ? currentAttachments.map((u: string) => (u === replacingUrl ? newUrl : u))
              : [...currentAttachments, newUrl];
            onUpdate(note.id, { attachments: updatedAttachments });
            setEditingDrawingUrl(null);
          }}
        />
      )}
    </>
  );
}

/** Small icon button for note card actions */
function ActionBtn({ onClick, children, className = '' }: { onClick: React.MouseEventHandler; children: React.ReactNode; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`p-1.5 rounded-full transition-colors ${className}`}
      style={{ color: 'var(--theme-text-muted)' }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--theme-hover)')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      {children}
    </button>
  );
}

/**
 * Icon button for the card's quick-management row (Delete/Archive/Pin).
 * Sized and spaced to match the "Checklist / Draw / Image" icons on the
 * home page's note composer, so touch targets stay comfortable and the
 * icons aren't packed tightly enough to invite a mis-tap.
 */
function QuickActionBtn({ onClick, children, title, active = false }: { onClick: React.MouseEventHandler; children: React.ReactNode; title?: string; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-2 rounded-full transition-colors ${active ? 'text-yellow-500' : ''}`}
      style={{ color: active ? undefined : 'var(--theme-text-muted)' }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--theme-hover)')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      {children}
    </button>
  );
}
