import GroupView from "@/components/GroupView";

export default async function GroupPage({ params }: PageProps<"/g/[id]">) {
  const { id } = await params;
  return <GroupView id={id} />;
}
