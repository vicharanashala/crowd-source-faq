import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import adminApi from '../../utils/adminApi';
import { inputStandard } from '../../../styles/style_config';

/* ────────────────────────────────────────
   Icon Palette (20 curated icons)
   ──────────────────────────────────────── */
const ICON_PALETTE: Record<string, React.ReactNode> = {
  document: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  question: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  cube: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
  flag: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
  check: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  star: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  book: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  code: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  users: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  rocket: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>,
  trophy: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>,
  clock: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  link: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  settings: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  video: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>,
  target: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  zap: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  award: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>,
  chat: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  calendar: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
};

/* ────────────────────────────────────────
   Interfaces
   ──────────────────────────────────────── */
interface ChecklistItem {
  _id?: string;
  label: string;
  order: number;
  isMandatory: boolean;
}

interface StepResource {
  _id?: string;
  title: string;
  url: string;
  type: 'link' | 'pdf' | 'video' | 'github' | 'doc' | 'discord';
}

interface TimelineStep {
  _id: string;
  title: string;
  description: string;
  icon: string;
  order: number;
  isMandatory: boolean;
  isLocked: boolean;
  status: 'active' | 'inactive';
  completionType: 'checklist' | 'manual' | 'automatic';
  estimatedTime?: string;
  rewards?: string;
  mentorNotes?: string;
  resources: StepResource[];
  checklistItems: ChecklistItem[];
}

/* ────────────────────────────────────────
   Sortable Step Card
   ──────────────────────────────────────── */
function SortableStepCard({
  step,
  onEdit,
  onDelete,
}: {
  step: TimelineStep;
  onEdit: (s: TimelineStep) => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-card border border-border rounded-xl p-5 flex items-center gap-4 group hover:border-accent/30 transition-all"
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-ink-faint hover:text-ink transition-colors p-1 flex-shrink-0"
        title="Drag to reorder"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
      </button>

      {/* Icon */}
      <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent flex-shrink-0">
        {ICON_PALETTE[step.icon] || ICON_PALETTE['document']}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-bold text-ink truncate">{step.title}</h3>
          {step.isMandatory && (
            <span className="px-1.5 py-0.5 text-[8px] uppercase font-bold tracking-widest bg-danger/10 text-danger rounded">Required</span>
          )}
          {step.isLocked && (
            <span className="px-1.5 py-0.5 text-[8px] uppercase font-bold tracking-widest bg-warning/10 text-warning rounded">Locked</span>
          )}
          <span className={`px-1.5 py-0.5 text-[8px] uppercase font-bold tracking-widest rounded ${
            step.status === 'active' ? 'bg-accent/10 text-accent' : 'bg-ink/10 text-ink-faint'
          }`}>{step.status}</span>
        </div>
        <p className="text-xs text-ink-faint truncate">{step.description || 'No description'}</p>
        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-ink-faint">
          <span>Type: {step.completionType}</span>
          <span>{step.checklistItems.length} checklist items</span>
          <span>{step.resources.length} resources</span>
          {step.estimatedTime && <span>Est: {step.estimatedTime}</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          onClick={() => onEdit(step)}
          className="p-2 rounded-lg text-ink-soft hover:text-ink hover:bg-bg transition-colors"
          title="Edit"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button
          onClick={() => onDelete(step._id)}
          className="p-2 rounded-lg text-danger/60 hover:text-danger hover:bg-danger/10 transition-colors"
          title="Delete"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════ */
export default function AdminTimelineBuilderTab() {
  const [steps, setSteps] = useState<TimelineStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<TimelineStep | null>(null);

  // Form state
  const [form, setForm] = useState({
    title: '',
    description: '',
    icon: 'document',
    isMandatory: true,
    isLocked: false,
    status: 'active' as 'active' | 'inactive',
    completionType: 'manual' as 'checklist' | 'manual' | 'automatic',
    estimatedTime: '',
    rewards: '',
    mentorNotes: '',
  });
  const [formChecklist, setFormChecklist] = useState<ChecklistItem[]>([]);
  const [formResources, setFormResources] = useState<StepResource[]>([]);
  const [showIconPicker, setShowIconPicker] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchSteps = useCallback(async () => {
    try {
      const res = await adminApi.get('/admin/timeline-steps');
      setSteps(res.data);
    } catch (error) {
      console.error('Error fetching timeline steps', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSteps(); }, [fetchSteps]);

  const openCreate = () => {
    setEditingStep(null);
    setForm({ title: '', description: '', icon: 'document', isMandatory: true, isLocked: false, status: 'active', completionType: 'manual', estimatedTime: '', rewards: '', mentorNotes: '' });
    setFormChecklist([]);
    setFormResources([]);
    setIsModalOpen(true);
  };

  const openEdit = (step: TimelineStep) => {
    setEditingStep(step);
    setForm({
      title: step.title,
      description: step.description,
      icon: step.icon,
      isMandatory: step.isMandatory,
      isLocked: step.isLocked,
      status: step.status,
      completionType: step.completionType,
      estimatedTime: step.estimatedTime || '',
      rewards: step.rewards || '',
      mentorNotes: step.mentorNotes || '',
    });
    setFormChecklist(step.checklistItems.map(c => ({ ...c })));
    setFormResources(step.resources.map(r => ({ ...r })));
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this timeline step?')) return;
    try {
      await adminApi.delete(`/admin/timeline-steps/${id}`);
      fetchSteps();
    } catch (error) {
      console.error('Error deleting step', error);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = steps.findIndex(s => s._id === active.id);
    const newIndex = steps.findIndex(s => s._id === over.id);
    const reordered = arrayMove(steps, oldIndex, newIndex);
    setSteps(reordered);

    try {
      await adminApi.put('/admin/timeline-steps/reorder', {
        orderedIds: reordered.map(s => s._id),
      });
    } catch (error) {
      console.error('Error reordering', error);
      fetchSteps();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      checklistItems: formChecklist.map((c, i) => ({ ...c, order: i })),
      resources: formResources,
    };

    try {
      if (editingStep) {
        await adminApi.put(`/admin/timeline-steps/${editingStep._id}`, payload);
      } else {
        await adminApi.post('/admin/timeline-steps', payload);
      }
      setIsModalOpen(false);
      fetchSteps();
    } catch (error) {
      console.error('Error saving step', error);
    }
  };

  // Checklist helpers
  const addChecklistItem = () => setFormChecklist(prev => [...prev, { label: '', order: prev.length, isMandatory: false }]);
  const removeChecklistItem = (i: number) => setFormChecklist(prev => prev.filter((_, idx) => idx !== i));
  const updateChecklistItem = (i: number, field: string, value: any) => {
    setFormChecklist(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  };

  // Resource helpers
  const addResource = () => setFormResources(prev => [...prev, { title: '', url: '', type: 'link' }]);
  const removeResource = (i: number) => setFormResources(prev => prev.filter((_, idx) => idx !== i));
  const updateResource = (i: number, field: string, value: any) => {
    setFormResources(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  };

  if (loading) return <div className="p-8 text-center text-ink-soft">Loading timeline steps...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">Timeline Builder</h2>
          <p className="text-sm text-ink-faint mt-0.5">Drag to reorder. Click edit to configure each step.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-[rgb(var(--bg-primary-rgb))] font-medium rounded-lg hover:bg-accent/90 transition-colors shadow-sm"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Step
        </button>
      </div>

      {/* Sortable list */}
      {steps.length === 0 ? (
        <div className="bg-card border-2 border-dashed border-border rounded-xl p-12 text-center">
          <p className="text-ink-soft">No timeline steps configured. Click "Add Step" to create the first one.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={steps.map(s => s._id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {steps.map((step) => (
                <SortableStepCard key={step._id} step={step} onEdit={openEdit} onDelete={handleDelete} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* ───────── Edit/Create Modal ───────── */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-5xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-border bg-bg/50">
                <h2 className="text-xl font-bold text-ink">{editingStep ? 'Edit Step' : 'Create Step'}</h2>
              </div>

              <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar flex-1">
                <form id="step-form" onSubmit={handleSubmit} className="space-y-8">
                  {/* Title + Icon */}
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-ink mb-1.5">Title</label>
                      <input
                        type="text" required
                        value={form.title}
                        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                        className={inputStandard}
                        placeholder="e.g. MARK Attendance"
                      />
                    </div>
                    <div className="w-24">
                      <label className="block text-sm font-medium text-ink mb-1.5">Icon</label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowIconPicker(!showIconPicker)}
                          className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 flex items-center justify-center text-accent hover:border-accent transition-colors"
                        >
                          {ICON_PALETTE[form.icon] || ICON_PALETTE['document']}
                        </button>
                        {showIconPicker && (
                          <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-xl p-3 grid grid-cols-5 sm:grid-cols-7 gap-2 w-[260px] sm:w-[320px]">
                            {Object.entries(ICON_PALETTE).map(([key, icon]) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => { setForm(f => ({ ...f, icon: key })); setShowIconPicker(false); }}
                                className={`p-2 rounded-lg flex items-center justify-center transition-colors ${form.icon === key ? 'bg-accent/20 text-accent' : 'hover:bg-bg text-ink-soft hover:text-ink'}`}
                                title={key}
                              >
                                {icon}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5">Description</label>
                    <textarea
                      rows={3}
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:border-accent transition-all resize-none"
                      placeholder="What does this step involve?"
                    />
                  </div>

                  {/* Settings grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">Completion Type</label>
                      <select value={form.completionType} onChange={e => setForm(f => ({ ...f, completionType: e.target.value as any }))} className={inputStandard}>
                        <option value="manual">Manual</option>
                        <option value="checklist">Checklist</option>
                        <option value="automatic">Automatic</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">Status</label>
                      <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))} className={inputStandard}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">Estimated Time</label>
                      <input type="text" value={form.estimatedTime} onChange={e => setForm(f => ({ ...f, estimatedTime: e.target.value }))} className={inputStandard} placeholder="e.g. ~2 min daily" />
                    </div>
                  </div>

                  {/* Toggles */}
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.isMandatory} onChange={e => setForm(f => ({ ...f, isMandatory: e.target.checked }))} className="w-4 h-4 rounded border-border" />
                      <span className="text-sm text-ink">Mandatory</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.isLocked} onChange={e => setForm(f => ({ ...f, isLocked: e.target.checked }))} className="w-4 h-4 rounded border-border" />
                      <span className="text-sm text-ink">Locked</span>
                    </label>
                  </div>

                  {/* Rewards + mentor notes */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">Rewards</label>
                      <input type="text" value={form.rewards} onChange={e => setForm(f => ({ ...f, rewards: e.target.value }))} className={inputStandard} placeholder="e.g. Unlocks Spurti Points" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1.5">Mentor Notes</label>
                      <input type="text" value={form.mentorNotes} onChange={e => setForm(f => ({ ...f, mentorNotes: e.target.value }))} className={inputStandard} placeholder="Internal note for mentor" />
                    </div>
                  </div>

                  {/* ── Checklist Items ── */}
                  <div className="border-t border-border pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-ink">Checklist Items</h3>
                      <button type="button" onClick={addChecklistItem} className="text-xs text-accent font-medium hover:underline">+ Add Item</button>
                    </div>
                    {formChecklist.length === 0 ? (
                      <p className="text-xs text-ink-faint">No checklist items. Add items for users to check off.</p>
                    ) : (
                      <div className="space-y-2">
                        {formChecklist.map((item, i) => (
                          <div key={i} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-bg/50 border border-border rounded-lg p-4">
                            <input
                              type="text" value={item.label}
                              onChange={e => updateChecklistItem(i, 'label', e.target.value)}
                              className="flex-1 w-full bg-card border border-border rounded-md px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent transition-colors" placeholder="Checklist item label"
                            />
                            <div className="flex items-center justify-between w-full sm:w-auto gap-4 mt-2 sm:mt-0">
                              <label className="flex items-center gap-2 text-xs text-ink-soft cursor-pointer">
                                <input type="checkbox" checked={item.isMandatory} onChange={e => updateChecklistItem(i, 'isMandatory', e.target.checked)} className="w-4 h-4 rounded border-border" />
                                Required
                              </label>
                              <button type="button" onClick={() => removeChecklistItem(i)} className="p-1.5 text-danger/60 hover:text-danger hover:bg-danger/10 rounded-md transition-colors" title="Remove item">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Resources ── */}
                  <div className="border-t border-border pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-ink">Resources</h3>
                      <button type="button" onClick={addResource} className="text-xs text-accent font-medium hover:underline">+ Add Resource</button>
                    </div>
                    {formResources.length === 0 ? (
                      <p className="text-xs text-ink-faint">No resources attached.</p>
                    ) : (
                      <div className="space-y-2">
                        {formResources.map((item, i) => (
                          <div key={i} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-bg/50 border border-border rounded-lg p-4">
                            <div className="flex-1 w-full flex flex-col sm:flex-row gap-3">
                              <input type="text" value={item.title} onChange={e => updateResource(i, 'title', e.target.value)} className="flex-1 bg-card border border-border rounded-md px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent transition-colors" placeholder="Resource Title" />
                              <input type="text" value={item.url} onChange={e => updateResource(i, 'url', e.target.value)} className="flex-[1.5] bg-card border border-border rounded-md px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent transition-colors font-mono" placeholder="https://..." />
                            </div>
                            <div className="flex items-center justify-between w-full sm:w-auto gap-3 mt-2 sm:mt-0">
                              <select value={item.type} onChange={e => updateResource(i, 'type', e.target.value)} className="bg-card border border-border rounded-md px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent transition-colors cursor-pointer">
                                <option value="link">Link</option>
                                <option value="pdf">PDF</option>
                                <option value="video">Video</option>
                                <option value="github">GitHub</option>
                                <option value="doc">Document</option>
                                <option value="discord">Discord</option>
                              </select>
                              <button type="button" onClick={() => removeResource(i)} className="p-1.5 text-danger/60 hover:text-danger hover:bg-danger/10 rounded-md transition-colors" title="Remove resource">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </form>
              </div>

              <div className="p-6 border-t border-border bg-bg/50 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-lg text-ink-soft hover:bg-bg hover:text-ink transition-colors font-medium">
                  Cancel
                </button>
                <button type="submit" form="step-form" className="px-5 py-2.5 rounded-lg bg-accent text-[rgb(var(--bg-primary-rgb))] font-medium hover:bg-accent/90 transition-colors shadow-sm">
                  {editingStep ? 'Save Changes' : 'Create Step'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
