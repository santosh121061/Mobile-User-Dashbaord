import { useLocalSearchParams } from "expo-router";
import UserForm from "@/features/user-form";
export default function Edit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <UserForm id={id} />;
}
