#pragma once

#include "Components/ActorComponent.h"
#include "Combat/TGGDamageTypes.h"
#include "TGGVehicleDamageComponent.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FTGGVehicleDurabilityChanged, float, PreviousValue, float, NewValue);
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FTGGVehicleDamageStateEvent);

UCLASS(ClassGroup=(TGG), meta=(BlueprintSpawnableComponent))
class TGGWORLD_API UTGGVehicleDamageComponent : public UActorComponent {
  GENERATED_BODY()

public:
  UTGGVehicleDamageComponent();

  UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category="TGG|Vehicle Damage")
  float MaxDurability = 100.0f;

  UPROPERTY(ReplicatedUsing=OnRep_Durability, BlueprintReadOnly, Category="TGG|Vehicle Damage")
  float Durability = 100.0f;

  UPROPERTY(ReplicatedUsing=OnRep_Disabled, BlueprintReadOnly, Category="TGG|Vehicle Damage")
  bool bDisabled = false;

  UPROPERTY(Replicated, EditAnywhere, BlueprintReadOnly, Category="TGG|Vehicle Damage")
  bool bInvulnerable = false;

  UPROPERTY(BlueprintAssignable, Category="TGG|Vehicle Damage")
  FTGGVehicleDurabilityChanged OnDurabilityChanged;
  UPROPERTY(BlueprintAssignable, Category="TGG|Vehicle Damage")
  FTGGVehicleDamageStateEvent OnDisabled;
  UPROPERTY(BlueprintAssignable, Category="TGG|Vehicle Damage")
  FTGGVehicleDamageStateEvent OnRestored;

  // Native-only: upstream authoritative systems validate impacts before creating this request.
  bool ApplyVehicleDamage(const FTGGDamageRequest& Request);

  UFUNCTION(BlueprintCallable, BlueprintAuthorityOnly, Category="TGG|Vehicle Damage")
  bool SetInvulnerable(bool bNewInvulnerable);

  UFUNCTION(BlueprintCallable, BlueprintAuthorityOnly, Category="TGG|Vehicle Damage")
  bool RestoreDurability(float DurabilityPercent = 1.0f);

  UFUNCTION(BlueprintPure, Category="TGG|Vehicle Damage")
  float GetDurabilityPercent() const;

  virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

protected:
  virtual void BeginPlay() override;
  UFUNCTION() void OnRep_Durability(float PreviousDurability);
  UFUNCTION() void OnRep_Disabled(bool bPreviousDisabled);
};
