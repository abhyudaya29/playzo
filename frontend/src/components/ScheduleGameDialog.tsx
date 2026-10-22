'use client';
import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field, ErrorNotice, BusyLabel } from '@/components/page-ui';
import { OptionSelect } from '@/components/option-select';
import { request } from '@/lib/api';
import { useSports } from '@/lib/use-sports';
import { refreshActivity } from '@/lib/social-types';
export default function ScheduleGameDialog({
  conversationId,
  peerName,
  onScheduled,
}: {
  conversationId: string;
  peerName: string;
  onScheduled: () => void;
}) {
  const sportsResource = useSports();
  const sports = sportsResource.data || [];
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false),
    [title, setTitle] = useState(''),
    [sport, setSport] = useState('Badminton'),
    [venue, setVenue] = useState(''),
    [starts, setStarts] = useState(''),
    [capacity, setCapacity] = useState('2'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (new Date(starts).getTime() <= Date.now()) {
      setError('Choose a future start time.');
      return;
    }
    setBusy(true);
    try {
      await request(
        `/api/v1/conversations/${conversationId}/games`,
        await getToken(),
        {
          method: 'POST',
          body: JSON.stringify({
            title: title.trim(),
            sport,
            venue: venue.trim(),
            starts_at: new Date(starts).toISOString(),
            capacity: Number(capacity),
          }),
        },
      );
      setOpen(false);
      setTitle('');
      setStarts('');
      setVenue('');
      onScheduled();
      refreshActivity();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not schedule your game.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          setOpen(value);
          setError('');
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarPlus />
          Plan a game
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Turn a conversation into a game</DialogTitle>
          <DialogDescription>
            {peerName} will receive an invitation to accept. Sending an
            invitation doesn’t reserve their spot.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <ErrorNotice message={error} />
          <Field id="chat-game-title" label="Game title">
            <Input
              id="chat-game-title"
              required
              minLength={2}
              maxLength={120}
              placeholder="Weekend badminton"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field id="chat-game-sport" label="Sport">
              <OptionSelect
                id="chat-game-sport"
                label="Game sport"
                options={sports}
                value={sport}
                onChange={setSport}
              />
            </Field>
            <Field id="chat-game-capacity" label="Total players">
              <Input
                id="chat-game-capacity"
                required
                type="number"
                min={2}
                max={100}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </Field>
          </div>
          <Field id="chat-game-venue" label="Venue">
            <Input
              id="chat-game-venue"
              required
              minLength={2}
              maxLength={180}
              placeholder="Community sports court"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
            />
          </Field>
          <Field
            id="chat-game-starts"
            label="Date and time"
            description="Uses your device’s local timezone."
          >
            <Input
              id="chat-game-starts"
              type="datetime-local"
              required
              value={starts}
              onChange={(e) => setStarts(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={busy}>
              <BusyLabel busy={busy}>Create game & invite</BusyLabel>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
