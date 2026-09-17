import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, Command } from 'lucide-react';
import { useState, useEffect, type FC } from 'react';

export const GlobalSearch: FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Handle keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setIsOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reset search when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  return (
    <>
      {/* Search Trigger Button */}
      <Button
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="h-10 w-48 justify-between text-muted-foreground hover:text-foreground"
      >
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4" />
          <span className="text-sm">Search...</span>
        </div>
        <div className="flex items-center gap-1 text-xs bg-muted px-1.5 py-0.5 rounded">
          <Command className="h-3 w-3" />
          <span>K</span>
        </div>
      </Button>

      {/* Search Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle>Search mattel</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col">
            {/* Search Input */}
            <div className="px-6 pb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  autoFocus
                />
              </div>
            </div>

            {/* Results placeholder */}
            <div className="max-h-96 overflow-y-auto border-t">
              <div className="p-6 text-center text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-3 opacity-50" />
                <p>Search not yet connected</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};