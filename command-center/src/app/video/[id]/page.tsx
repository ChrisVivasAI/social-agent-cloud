import { ProjectDetail } from "@/components/video/project-detail";

export default async function VideoProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ProjectDetail projectId={id} />;
}
