import { useLocalSearchParams } from "expo-router";
import RoleForm from "@/features/role-form";
export default function Role() {
    const { id } = useLocalSearchParams<{ id: string }>();
    return <RoleForm id={id} />;
}
