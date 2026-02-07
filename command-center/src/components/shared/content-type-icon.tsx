import { Link, Image, Video, Film, Type, Scissors } from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  link: Link,
  image: Image,
  video: Video,
  remotion: Film,
  text: Type,
  video_edit: Scissors,
};

interface ContentTypeIconProps {
  type: string;
  className?: string;
}

export function ContentTypeIcon({ type, className = "w-4 h-4" }: ContentTypeIconProps) {
  const Icon = ICON_MAP[type] || Type;
  return <Icon className={className} />;
}
