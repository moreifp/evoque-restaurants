import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Instagram, Video, Youtube, FileText, Twitter, Facebook, ExternalLink, Trash2, Plus } from 'lucide-react';

export interface SocialLink {
  id?: string;
  platform: string;
  url: string;
  title?: string;
}

interface SocialLinksInputProps {
  links: SocialLink[];
  onChange: (links: SocialLink[]) => void;
}

const platformIcons = {
  instagram: Instagram,
  tiktok: Video,
  youtube: Youtube,
  blog: FileText,
  twitter: Twitter,
  facebook: Facebook,
  other: ExternalLink,
};

const platforms = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'blog', label: 'Blog' },
  { value: 'twitter', label: 'Twitter/X' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'other', label: 'Other' },
];

export const SocialLinksInput: React.FC<SocialLinksInputProps> = ({ links, onChange }) => {
  const [newLink, setNewLink] = useState<SocialLink>({
    platform: 'instagram',
    url: '',
    title: '',
  });

  const addLink = () => {
    if (!newLink.url.trim()) return;
    
    // Basic URL validation
    if (!newLink.url.match(/^https?:\/\//)) {
      alert('Please enter a valid URL starting with http:// or https://');
      return;
    }

    onChange([...links, { ...newLink }]);
    setNewLink({ platform: 'instagram', url: '', title: '' });
  };

  const removeLink = (index: number) => {
    onChange(links.filter((_, i) => i !== index));
  };

  const getPlatformIcon = (platform: string) => {
    const Icon = platformIcons[platform as keyof typeof platformIcons] || ExternalLink;
    return <Icon className="w-4 h-4" />;
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Label>Social Media Links</Label>
        <p className="text-sm text-muted-foreground">
          Add links to your restaurant reviews, Instagram posts, TikTok videos, or blog articles
        </p>

        {/* Existing Links */}
        {links.length > 0 && (
          <div className="space-y-2">
            {links.map((link, index) => (
              <div key={index} className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
                <div className="flex-shrink-0">
                  {getPlatformIcon(link.platform)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium capitalize">{link.platform}</p>
                  {link.title && <p className="text-xs text-muted-foreground truncate">{link.title}</p>}
                  <p className="text-xs text-muted-foreground truncate">{link.url}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeLink(index)}
                  className="flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add New Link */}
        <div className="space-y-3 p-4 border rounded-lg">
          <div className="grid gap-3">
            <div>
              <Label htmlFor="platform">Platform</Label>
              <Select
                value={newLink.platform}
                onValueChange={(value) => setNewLink({ ...newLink, platform: value })}
              >
                <SelectTrigger id="platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {platforms.map((platform) => (
                    <SelectItem key={platform.value} value={platform.value}>
                      <div className="flex items-center gap-2">
                        {getPlatformIcon(platform.value)}
                        {platform.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="url">URL *</Label>
              <Input
                id="url"
                type="url"
                placeholder="https://..."
                value={newLink.url}
                onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addLink();
                  }
                }}
              />
            </div>

            <div>
              <Label htmlFor="title">Title (optional)</Label>
              <Input
                id="title"
                placeholder="e.g., My full review, Food tour vlog"
                value={newLink.title || ''}
                onChange={(e) => setNewLink({ ...newLink, title: e.target.value })}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addLink();
                  }
                }}
              />
            </div>
          </div>

          <Button
            type="button"
            onClick={addLink}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Link
          </Button>
        </div>
      </div>
    </div>
  );
};
