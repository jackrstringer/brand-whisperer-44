import { useParams, useNavigate } from 'react-router-dom';
import { DndContext, DragEndEvent, DragOverlay, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { useIdeation } from '@/hooks/useIdeation';
import { useDesignQueue } from '@/hooks/useDesignQueue';
import { useIdeationCalendar } from '@/hooks/useIdeationCalendar';
import { CampaignTypePicker } from '@/components/ideation/CampaignTypePicker';
import { NodeFlow } from '@/components/ideation/NodeFlow';
import { ChatBar } from '@/components/ideation/ChatBar';
import { DesignQueue } from '@/components/ideation/DesignQueue';
import { IdeationCalendar } from '@/components/ideation/IdeationCalendar';
import { CampaignIdea } from '@/lib/types';
import { useState } from 'react';
import { Lightbulb, PanelRightOpen, PanelRightClose } from 'lucide-react';

export default function IdeatePage() {
  const { brandId } = useParams<{ brandId: string }>();
  const navigate = useNavigate();
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [mobileTab, setMobileTab] = useState<'queue' | 'calendar' | null>(null);

  const ideation = useIdeation(brandId!);
  const designQueue = useDesignQueue(brandId!);
  const calendar = useIdeationCalendar(brandId!);

  const hasStarted = ideation.nodes.length > 0;
  const selectedIdsSet = new Set(ideation.selectedIdeas.keys());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleAddToQueue = (idea: CampaignIdea, sendDate?: string) => {
    designQueue.addToQueue.mutate({
      idea,
      sessionId: ideation.sessionId,
      sendDate: sendDate || null,
    });
  };

  const handleBuildNow = (idea: CampaignIdea) => {
    // Navigate to campaign creation with idea data pre-filled
    const params = new URLSearchParams({
      title: idea.title,
      brief: idea.campaign_info || idea.description || '',
      goal: idea.campaign_type || '',
      copy: idea.copy_direction || '',
      subject: idea.subject_line || '',
    });
    navigate(`/brands/${brandId}?new=true&${params.toString()}`);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const dragData = active.data.current as any;
    const dropId = over.id as string;

    if (dragData?.type === 'idea') {
      if (dropId === 'design-queue') {
        handleAddToQueue(dragData.idea);
      } else if (dropId.startsWith('calendar-day-')) {
        const date = dropId.replace('calendar-day-', '');
        handleAddToQueue(dragData.idea, date);
      }
    }

    if (dragData?.type === 'queue-item') {
      if (dropId === 'design-queue') {
        designQueue.clearDate.mutate(dragData.item.id);
      } else if (dropId.startsWith('calendar-day-')) {
        const date = dropId.replace('calendar-day-', '');
        designQueue.setDate.mutate({ id: dragData.item.id, date });
      }
    }
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="h-screen flex flex-col bg-background">
        {/* Top bar */}
        <div className="h-12 border-b border-border flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-foreground" />
            <span className="text-sm font-semibold text-foreground">Ideate</span>
          </div>
          <button
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors hidden lg:flex"
          >
            {rightPanelOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
        </div>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel — Ideation Flow */}
          <div className={`flex flex-col ${rightPanelOpen ? 'w-full lg:w-[55%]' : 'w-full'} border-r border-border transition-all`}>
            {/* Campaign Type Picker */}
            <CampaignTypePicker
              onSelectType={(type, sub) => ideation.generateForType(type, sub)}
              activeType={ideation.activeType}
              isCompact={hasStarted}
            />

            {/* Node Flow */}
            <NodeFlow
              nodes={ideation.nodes}
              streamingIdeas={ideation.streamingIdeas}
              streamingNodeId={ideation.streamingNodeId}
              selectedIds={selectedIdsSet}
              isTurbo={ideation.turboMode}
              onToggleSelect={ideation.toggleSelect}
              onAddToQueue={handleAddToQueue}
              onBuildNow={handleBuildNow}
            />

            {/* Chat Bar */}
            <ChatBar
              onSend={ideation.sendChat}
              isGenerating={ideation.isGenerating}
              isChatting={ideation.isChatting}
              selectedCount={ideation.selectedIdeas.size}
              onClearSelection={ideation.clearSelection}
              chaosMode={ideation.chaosMode}
              turboMode={ideation.turboMode}
              onToggleChaos={ideation.toggleChaosMode}
              onToggleTurbo={ideation.toggleTurboMode}
            />
          </div>

          {/* Right Panel — Desktop */}
          {rightPanelOpen && (
            <div className="hidden lg:flex lg:w-[45%] flex-col">
              {/* Design Queue — top half */}
              <div className="h-1/2 border-b border-border">
                <DesignQueue
                  items={designQueue.items}
                  onRemove={(id) => designQueue.removeFromQueue.mutate(id)}
                />
              </div>

              {/* Calendar — bottom half */}
              <div className="h-1/2">
                <IdeationCalendar
                  currentMonth={calendar.currentMonth}
                  calendarData={calendar.calendarData}
                  onNavigateMonth={calendar.navigateMonth}
                />
              </div>
            </div>
          )}
        </div>

        {/* Mobile bottom tabs */}
        <div className="lg:hidden flex border-t border-border bg-card">
          <button
            onClick={() => setMobileTab(mobileTab === 'queue' ? null : 'queue')}
            className={`flex-1 py-2.5 text-xs font-medium text-center transition-colors ${
              mobileTab === 'queue' ? 'text-foreground bg-muted' : 'text-muted-foreground'
            }`}
          >
            Queue ({designQueue.items.length})
          </button>
          <button
            onClick={() => setMobileTab(mobileTab === 'calendar' ? null : 'calendar')}
            className={`flex-1 py-2.5 text-xs font-medium text-center transition-colors ${
              mobileTab === 'calendar' ? 'text-foreground bg-muted' : 'text-muted-foreground'
            }`}
          >
            Calendar
          </button>
        </div>

        {/* Mobile drawer */}
        {mobileTab && (
          <div className="lg:hidden fixed inset-x-0 bottom-10 h-[50vh] bg-card border-t border-border z-50 animate-in slide-in-from-bottom duration-200">
            {mobileTab === 'queue' ? (
              <DesignQueue
                items={designQueue.items}
                onRemove={(id) => designQueue.removeFromQueue.mutate(id)}
              />
            ) : (
              <IdeationCalendar
                currentMonth={calendar.currentMonth}
                calendarData={calendar.calendarData}
                onNavigateMonth={calendar.navigateMonth}
              />
            )}
          </div>
        )}
      </div>
    </DndContext>
  );
}
