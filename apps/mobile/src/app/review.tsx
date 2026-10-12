import { router } from 'expo-router';

import { errorMessage } from '@/api/client';
import { useCreateRestaurant } from '@/api/hooks';
import { Screen } from '@/components/ui';
import { ReviewForm } from '@/review/ReviewForm';
import { useAppState } from '@/state/AppState';

export default function Review() {
  const { scanDraft, setScanDraft } = useAppState();
  const create = useCreateRestaurant();

  return (
    <Screen testID="review-screen">
      <ReviewForm
        key={scanDraft?.scanId ?? 'manual'}
        draft={scanDraft}
        saving={create.isPending}
        saveError={create.isError ? errorMessage(create.error) : null}
        onSave={(input) =>
          create.mutate(input, {
            onSuccess: (res) => {
              setScanDraft(null);
              // Leave scan + review off the back stack: back from the new menu goes to the library.
              router.dismissTo('/library');
              router.push({ pathname: '/restaurant/[id]', params: { id: res.restaurant.id } });
            },
          })
        }
      />
    </Screen>
  );
}
