import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.code}>404</p>
        <h1>Событие не найдено</h1>
        <p>
          Возможно, оно было удалено или указан неверный идентификатор.
        </p>
        <Link href="/">Вернуться к списку событий</Link>
      </section>
    </main>
  );
}
